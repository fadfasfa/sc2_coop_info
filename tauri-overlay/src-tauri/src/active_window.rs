#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ActiveWindowRect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl ActiveWindowRect {
    pub fn new(x: i32, y: i32, width: u32, height: u32) -> Option<Self> {
        if width == 0 || height == 0 {
            return None;
        }

        Some(Self {
            x,
            y,
            width,
            height,
        })
    }

    pub fn x(&self) -> i32 {
        self.x
    }

    pub fn y(&self) -> i32 {
        self.y
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }
}

pub struct ActiveWindowInfo {
    application_name: String,
    title: String,
    rect: Option<ActiveWindowRect>,
}

impl ActiveWindowInfo {
    pub fn new(application_name: impl Into<String>, title: impl Into<String>) -> Self {
        Self::new_with_rect(application_name, title, None)
    }

    pub fn new_with_rect(
        application_name: impl Into<String>,
        title: impl Into<String>,
        rect: Option<ActiveWindowRect>,
    ) -> Self {
        Self {
            application_name: application_name.into(),
            title: title.into(),
            rect,
        }
    }

    pub fn application_name(&self) -> &str {
        &self.application_name
    }

    pub fn title(&self) -> &str {
        &self.title
    }

    pub fn rect(&self) -> Option<ActiveWindowRect> {
        self.rect
    }

    pub fn is_sc2_window(&self) -> bool {
        ActiveWindowDetector::is_sc2_window_identity(&self.application_name, &self.title)
    }
}

type FocusCallback = Box<dyn Fn(bool) + Send + 'static>;

pub struct ActiveWindowListener {
    _platform_listener: platform::PlatformActiveWindowListener,
}

impl ActiveWindowListener {
    fn new(platform_listener: platform::PlatformActiveWindowListener) -> Self {
        Self {
            _platform_listener: platform_listener,
        }
    }
}

pub struct ActiveWindowDetector;

impl ActiveWindowDetector {
    pub fn focused_window_info() -> Result<Option<ActiveWindowInfo>, String> {
        platform::PlatformActiveWindowDetector::focused_window_info()
    }

    pub fn focused_window_is_sc2() -> Result<bool, String> {
        Ok(Self::focused_window_info()?
            .as_ref()
            .is_some_and(ActiveWindowInfo::is_sc2_window))
    }

    pub fn focused_sc2_window_info() -> Result<Option<ActiveWindowInfo>, String> {
        Ok(Self::focused_window_info()?.filter(ActiveWindowInfo::is_sc2_window))
    }

    /// Placement-only lookup; never captures pixels or changes focus.
    /// Keep the player overlay on the existing focused-window API.
    pub fn sc2_window_rect_for_placement() -> Result<Option<ActiveWindowRect>, String> {
        if let Ok(Some(info)) = Self::focused_sc2_window_info()
            && let Some(rect) = info.rect()
        {
            return Ok(Some(rect));
        }
        let windows = xcap::Window::all()
            .map_err(|error| format!("Failed to enumerate SC2 windows: {error}"))?;
        Ok(windows.into_iter().find_map(|window| {
            if window.is_minimized().unwrap_or(true)
                || !Self::is_sc2_window_identity(
                    &window.app_name().unwrap_or_default(),
                    &window.title().unwrap_or_default(),
                )
            {
                return None;
            }
            ActiveWindowRect::new(
                window.x().ok()?, window.y().ok()?,
                window.width().ok()?, window.height().ok()?,
            )
        }))
    }

    pub fn spawn_focus_listener<F>(callback: F) -> Result<ActiveWindowListener, String>
    where
        F: Fn(bool) + Send + 'static,
    {
        platform::PlatformActiveWindowDetector::spawn_focus_listener(Box::new(callback))
            .map(ActiveWindowListener::new)
    }

    pub fn is_sc2_window_identity(app_name: &str, title: &str) -> bool {
        let normalized_app_name = app_name.trim().to_ascii_lowercase();
        let normalized_title = title.trim().to_ascii_lowercase();

        normalized_app_name == "sc2.exe"
            || normalized_app_name == "sc2_x64.exe"
            || normalized_app_name == "starcraft ii.exe"
            || normalized_app_name == "starcraft ii"
            || normalized_app_name == "com.blizzard.starcraft2"
            || normalized_title == "com.blizzard.starcraft2"
            || normalized_title == "starcraft ii"
    }
}

#[cfg(windows)]
impl ActiveWindowDetector {
    pub fn windows_window_info(hwnd: windows::Win32::Foundation::HWND) -> ActiveWindowInfo {
        platform::PlatformActiveWindowDetector::window_info(hwnd)
    }
}

#[cfg(windows)]
mod platform {
    use std::path::Path;
    use std::sync::mpsc;
    use std::thread;

    use windows::Win32::Foundation::{
        CloseHandle, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, RECT, WPARAM,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::{
        GetCurrentThreadId, OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        QueryFullProcessImageNameW,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CREATESTRUCTW, CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW,
        GWLP_USERDATA, GetForegroundWindow, GetMessageW, GetWindowLongPtrW, GetWindowRect,
        GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, HSHELL_WINDOWACTIVATED,
        IsIconic, MSG, PostThreadMessageW, RegisterClassW, RegisterShellHookWindow,
        RegisterWindowMessageW, SetWindowLongPtrW, TranslateMessage, WINDOW_EX_STYLE, WINDOW_STYLE,
        WM_NCCREATE, WM_QUIT, WNDCLASSW,
    };
    use windows::core::{PWSTR, w};

    use super::{ActiveWindowInfo, ActiveWindowRect, FocusCallback};

    const HSHELL_RUDEAPPACTIVATED: u32 = 0x8004;

    pub struct PlatformActiveWindowDetector;

    impl PlatformActiveWindowDetector {
        pub fn focused_window_info() -> Result<Option<ActiveWindowInfo>, String> {
            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.is_invalid() || unsafe { IsIconic(hwnd).as_bool() } {
                return Ok(None);
            }

            Ok(Some(Self::window_info(hwnd)))
        }

        pub fn spawn_focus_listener(
            callback: FocusCallback,
        ) -> Result<PlatformActiveWindowListener, String> {
            let (ready_sender, ready_receiver) = mpsc::channel();
            let join_handle = thread::Builder::new()
                .name("sco-active-window-listener".to_string())
                .spawn(move || WindowsActiveWindowListenerThread::run(callback, ready_sender))
                .map_err(|error| format!("Failed to spawn active window listener: {error}"))?;

            let thread_id = ready_receiver
                .recv()
                .map_err(|error| format!("Active window listener failed to start: {error}"))??;

            Ok(PlatformActiveWindowListener::new(thread_id, join_handle))
        }

        pub fn window_info(hwnd: HWND) -> ActiveWindowInfo {
            ActiveWindowInfo::new_with_rect(
                Self::process_file_name(hwnd).unwrap_or_default(),
                Self::window_title(hwnd),
                Self::window_rect(hwnd),
            )
        }

        fn window_rect(hwnd: HWND) -> Option<ActiveWindowRect> {
            let mut rect = RECT::default();
            unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
            let width = u32::try_from(i64::from(rect.right) - i64::from(rect.left)).ok()?;
            let height = u32::try_from(i64::from(rect.bottom) - i64::from(rect.top)).ok()?;

            ActiveWindowRect::new(rect.left, rect.top, width, height)
        }

        fn process_file_name(hwnd: HWND) -> Option<String> {
            let mut process_id = 0_u32;
            unsafe {
                GetWindowThreadProcessId(hwnd, Some(&mut process_id));
            }
            if process_id == 0 {
                return None;
            }

            let process = ProcessHandle::new(process_id).ok()?;
            let mut buffer = vec![0_u16; 32_768];
            let mut buffer_len = u32::try_from(buffer.len()).ok()?;
            unsafe {
                QueryFullProcessImageNameW(
                    process.handle(),
                    PROCESS_NAME_WIN32,
                    PWSTR(buffer.as_mut_ptr()),
                    &mut buffer_len,
                )
                .ok()?;
            }

            let image_name = String::from_utf16_lossy(&buffer[..buffer_len as usize]);
            let file_name = Path::new(&image_name).file_name()?.to_str()?;
            Some(file_name.to_string())
        }

        fn window_title(hwnd: HWND) -> String {
            let length = unsafe { GetWindowTextLengthW(hwnd) };
            if length <= 0 {
                return String::new();
            }

            let mut buffer = vec![0_u16; length as usize + 1];
            let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
            if copied <= 0 {
                return String::new();
            }

            String::from_utf16_lossy(&buffer[..copied as usize])
        }
    }

    pub struct PlatformActiveWindowListener {
        thread_id: u32,
        join_handle: Option<thread::JoinHandle<()>>,
    }

    impl PlatformActiveWindowListener {
        fn new(thread_id: u32, join_handle: thread::JoinHandle<()>) -> Self {
            Self {
                thread_id,
                join_handle: Some(join_handle),
            }
        }
    }

    impl Drop for PlatformActiveWindowListener {
        fn drop(&mut self) {
            let _ = unsafe { PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0)) };
            if let Some(join_handle) = self.join_handle.take() {
                let _ = join_handle.join();
            }
        }
    }

    struct WindowsActiveWindowListenerThread;

    impl WindowsActiveWindowListenerThread {
        fn run(callback: FocusCallback, ready_sender: mpsc::Sender<Result<u32, String>>) {
            let thread_id = unsafe { GetCurrentThreadId() };
            let shell_hook_message = unsafe { RegisterWindowMessageW(w!("SHELLHOOK")) };
            if shell_hook_message == 0 {
                let _ = ready_sender.send(Err(
                    "Failed to register Windows shell hook message".to_string()
                ));
                return;
            }

            let window_context = Box::new(WindowsActiveWindowContext::new(
                callback,
                shell_hook_message,
            ));
            let window_context_ptr = Box::into_raw(window_context);
            match Self::create_listener_window(window_context_ptr) {
                Ok(window) => {
                    if !unsafe { RegisterShellHookWindow(window) }.as_bool() {
                        unsafe {
                            let _ = DestroyWindow(window);
                            drop(Box::from_raw(window_context_ptr));
                        }
                        let _ = ready_sender.send(Err(
                            "Failed to register Windows shell hook window".to_string(),
                        ));
                        return;
                    }

                    let _ = ready_sender.send(Ok(thread_id));
                    unsafe {
                        (*window_context_ptr).emit_current_focus();
                    }
                    Self::message_loop();
                    unsafe {
                        let _ = DestroyWindow(window);
                        drop(Box::from_raw(window_context_ptr));
                    }
                }
                Err(error) => {
                    unsafe {
                        drop(Box::from_raw(window_context_ptr));
                    }
                    let _ = ready_sender.send(Err(error));
                }
            }
        }

        fn create_listener_window(
            window_context: *mut WindowsActiveWindowContext,
        ) -> Result<HWND, String> {
            let module = unsafe { GetModuleHandleW(None) }
                .map_err(|error| format!("Failed to read module handle: {error}"))?;
            let hinstance = HINSTANCE(module.0);
            let window_class = WNDCLASSW {
                hInstance: hinstance,
                lpszClassName: w!("Sc2CoopActiveWindowListener"),
                lpfnWndProc: Some(active_window_listener_window_proc),
                ..Default::default()
            };
            unsafe {
                RegisterClassW(&window_class);
            }

            unsafe {
                CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    w!("Sc2CoopActiveWindowListener"),
                    w!("Sc2CoopActiveWindowListener"),
                    WINDOW_STYLE::default(),
                    0,
                    0,
                    0,
                    0,
                    None,
                    None,
                    Some(hinstance),
                    Some(window_context.cast_const().cast()),
                )
            }
            .map_err(|error| format!("Failed to create active window listener: {error}"))
        }

        fn message_loop() {
            let mut message = MSG::default();
            loop {
                let result = unsafe { GetMessageW(&mut message, None, 0, 0) }.0;
                if result <= 0 {
                    break;
                }
                unsafe {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
        }
    }

    struct WindowsActiveWindowContext {
        callback: FocusCallback,
        shell_hook_message: u32,
    }

    impl WindowsActiveWindowContext {
        fn new(callback: FocusCallback, shell_hook_message: u32) -> Self {
            Self {
                callback,
                shell_hook_message,
            }
        }

        fn emit_focus_for_window(&self, hwnd: HWND) {
            let focused = if hwnd.is_invalid() || unsafe { IsIconic(hwnd).as_bool() } {
                false
            } else {
                PlatformActiveWindowDetector::window_info(hwnd).is_sc2_window()
            };
            (self.callback)(focused);
        }

        fn emit_current_focus(&self) {
            let focused = PlatformActiveWindowDetector::focused_window_info()
                .ok()
                .flatten()
                .as_ref()
                .is_some_and(ActiveWindowInfo::is_sc2_window);
            (self.callback)(focused);
        }
    }

    unsafe extern "system" fn active_window_listener_window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_NCCREATE {
            let create_struct = lparam.0 as *const CREATESTRUCTW;
            if !create_struct.is_null() {
                let context = unsafe { (*create_struct).lpCreateParams };
                unsafe {
                    SetWindowLongPtrW(hwnd, GWLP_USERDATA, context as isize);
                }
                return LRESULT(1);
            }
        }

        let context =
            unsafe { GetWindowLongPtrW(hwnd, GWLP_USERDATA) } as *const WindowsActiveWindowContext;
        if !context.is_null() {
            let context = unsafe { &*context };
            let shell_event = wparam.0 as u32;
            if message == context.shell_hook_message
                && (shell_event == HSHELL_WINDOWACTIVATED || shell_event == HSHELL_RUDEAPPACTIVATED)
            {
                context.emit_focus_for_window(HWND(lparam.0 as _));
                return LRESULT(0);
            }
        }

        unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
    }

    struct ProcessHandle {
        handle: HANDLE,
    }

    impl ProcessHandle {
        fn new(process_id: u32) -> Result<Self, String> {
            let handle = unsafe {
                OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
                    .map_err(|error| format!("OpenProcess failed for active window: {error}"))?
            };

            Ok(Self { handle })
        }

        fn handle(&self) -> HANDLE {
            self.handle
        }
    }

    impl Drop for ProcessHandle {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.handle);
            }
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::{CStr, c_char, c_void};

    use super::{ActiveWindowInfo, ActiveWindowRect, FocusCallback};

    type ObjectiveCBool = i8;
    type ObjectiveCClass = *mut c_void;
    type ObjectiveCId = *mut c_void;
    type ObjectiveCImp = unsafe extern "C" fn(ObjectiveCId, ObjectiveCSelector, ObjectiveCId);
    type ObjectiveCSelector = *mut c_void;

    #[link(name = "AppKit", kind = "framework")]
    unsafe extern "C" {
        static NSWorkspaceDidActivateApplicationNotification: ObjectiveCId;
    }

    #[link(name = "objc")]
    unsafe extern "C" {
        fn class_addIvar(
            cls: ObjectiveCClass,
            name: *const c_char,
            size: usize,
            alignment: u8,
            types: *const c_char,
        ) -> ObjectiveCBool;
        fn class_addMethod(
            cls: ObjectiveCClass,
            name: ObjectiveCSelector,
            imp: ObjectiveCImp,
            types: *const c_char,
        ) -> ObjectiveCBool;
        fn object_getInstanceVariable(
            object: ObjectiveCId,
            name: *const c_char,
            out_value: *mut *mut c_void,
        ) -> *mut c_void;
        fn object_setInstanceVariable(
            object: ObjectiveCId,
            name: *const c_char,
            value: *mut c_void,
        ) -> *mut c_void;
        fn objc_allocateClassPair(
            superclass: ObjectiveCClass,
            name: *const c_char,
            extra_bytes: usize,
        ) -> ObjectiveCClass;
        fn objc_getClass(name: *const c_char) -> ObjectiveCId;
        fn objc_registerClassPair(cls: ObjectiveCClass);
        #[link_name = "objc_msgSend"]
        fn objc_msgSend_id(receiver: ObjectiveCId, selector: ObjectiveCSelector) -> ObjectiveCId;
        #[link_name = "objc_msgSend"]
        fn objc_msgSend_void_id(
            receiver: ObjectiveCId,
            selector: ObjectiveCSelector,
            argument: ObjectiveCId,
        );
        #[link_name = "objc_msgSend"]
        fn objc_msgSend_void_id_sel_id_id(
            receiver: ObjectiveCId,
            selector: ObjectiveCSelector,
            observer: ObjectiveCId,
            notification_selector: ObjectiveCSelector,
            name: ObjectiveCId,
            object: ObjectiveCId,
        );
        #[link_name = "objc_msgSend"]
        fn objc_msgSend_ptr(receiver: ObjectiveCId, selector: ObjectiveCSelector) -> *const c_char;
        #[link_name = "objc_msgSend"]
        fn objc_msgSend_void(receiver: ObjectiveCId, selector: ObjectiveCSelector);
        fn sel_registerName(name: *const c_char) -> ObjectiveCSelector;
    }

    pub struct PlatformActiveWindowDetector;

    impl PlatformActiveWindowDetector {
        pub fn focused_window_info() -> Result<Option<ActiveWindowInfo>, String> {
            let Some(_pool) = AutoreleasePool::new() else {
                return Ok(None);
            };

            let Some(workspace_class) = Self::class(b"NSWorkspace\0") else {
                return Ok(None);
            };
            let workspace = Self::send_id(workspace_class, b"sharedWorkspace\0");
            let application = Self::send_id(workspace, b"frontmostApplication\0");
            if application.is_null() {
                return Ok(None);
            }

            let application_name =
                Self::ns_string(Self::send_id(application, b"localizedName\0")).unwrap_or_default();
            let bundle_identifier =
                Self::ns_string(Self::send_id(application, b"bundleIdentifier\0"))
                    .unwrap_or_default();
            if application_name.is_empty() && bundle_identifier.is_empty() {
                return Ok(None);
            }

            Ok(Some(ActiveWindowInfo::new_with_rect(
                application_name,
                bundle_identifier,
                Self::focused_xcap_window_rect(),
            )))
        }

        pub fn spawn_focus_listener(
            callback: FocusCallback,
        ) -> Result<PlatformActiveWindowListener, String> {
            let Some(_pool) = AutoreleasePool::new() else {
                return Err("Failed to create macOS autorelease pool".to_string());
            };
            let observer_class = Self::observer_class()?;
            let observer = Self::send_id(Self::send_id(observer_class, b"alloc\0"), b"init\0");
            if observer.is_null() {
                return Err("Failed to create macOS active window observer".to_string());
            }

            let context = Box::into_raw(Box::new(MacActiveWindowContext::new(callback)));
            unsafe {
                object_setInstanceVariable(observer, b"context\0".as_ptr().cast(), context.cast());
            }

            let notification_center = Self::workspace_notification_center()
                .ok_or_else(|| "Failed to read macOS workspace notification center".to_string())?;
            unsafe {
                objc_msgSend_void_id_sel_id_id(
                    notification_center,
                    Self::selector(b"addObserver:selector:name:object:\0"),
                    observer,
                    Self::selector(b"activeApplicationChanged:\0"),
                    NSWorkspaceDidActivateApplicationNotification,
                    std::ptr::null_mut(),
                );
            }

            let listener = PlatformActiveWindowListener::new(observer, context);
            listener.emit_current_focus();
            Ok(listener)
        }

        fn observer_class() -> Result<ObjectiveCClass, String> {
            if let Some(existing_class) = Self::class(b"Sc2CoopActiveWindowObserver\0") {
                return Ok(existing_class);
            }

            let ns_object_class = Self::class(b"NSObject\0")
                .ok_or_else(|| "Failed to read NSObject class".to_string())?;
            let observer_class = unsafe {
                objc_allocateClassPair(
                    ns_object_class,
                    b"Sc2CoopActiveWindowObserver\0".as_ptr().cast(),
                    0,
                )
            };
            if observer_class.is_null() {
                return Self::class(b"Sc2CoopActiveWindowObserver\0").ok_or_else(|| {
                    "Failed to allocate macOS active window observer class".to_string()
                });
            }

            let pointer_alignment =
                u8::try_from(std::mem::align_of::<*mut c_void>().trailing_zeros()).unwrap_or(3);
            unsafe {
                class_addIvar(
                    observer_class,
                    b"context\0".as_ptr().cast(),
                    std::mem::size_of::<*mut c_void>(),
                    pointer_alignment,
                    b"^v\0".as_ptr().cast(),
                );
                class_addMethod(
                    observer_class,
                    Self::selector(b"activeApplicationChanged:\0"),
                    active_application_changed,
                    b"v@:@\0".as_ptr().cast(),
                );
                objc_registerClassPair(observer_class);
            }

            Ok(observer_class)
        }

        fn class(name: &'static [u8]) -> Option<ObjectiveCId> {
            let class = unsafe { objc_getClass(name.as_ptr().cast()) };
            (!class.is_null()).then_some(class)
        }

        fn selector(name: &'static [u8]) -> ObjectiveCSelector {
            unsafe { sel_registerName(name.as_ptr().cast()) }
        }

        fn send_id(receiver: ObjectiveCId, selector_name: &'static [u8]) -> ObjectiveCId {
            if receiver.is_null() {
                return std::ptr::null_mut();
            }

            unsafe { objc_msgSend_id(receiver, Self::selector(selector_name)) }
        }

        fn send_void_id(
            receiver: ObjectiveCId,
            selector_name: &'static [u8],
            argument: ObjectiveCId,
        ) {
            if receiver.is_null() {
                return;
            }

            unsafe {
                objc_msgSend_void_id(receiver, Self::selector(selector_name), argument);
            }
        }

        fn send_ptr(receiver: ObjectiveCId, selector_name: &'static [u8]) -> *const c_char {
            if receiver.is_null() {
                return std::ptr::null();
            }

            unsafe { objc_msgSend_ptr(receiver, Self::selector(selector_name)) }
        }

        fn send_void(receiver: ObjectiveCId, selector_name: &'static [u8]) {
            if receiver.is_null() {
                return;
            }

            unsafe {
                objc_msgSend_void(receiver, Self::selector(selector_name));
            }
        }

        fn ns_string(value: ObjectiveCId) -> Option<String> {
            let utf8 = Self::send_ptr(value, b"UTF8String\0");
            if utf8.is_null() {
                return None;
            }

            unsafe { CStr::from_ptr(utf8) }
                .to_str()
                .ok()
                .map(ToOwned::to_owned)
        }

        fn workspace_notification_center() -> Option<ObjectiveCId> {
            let workspace_class = Self::class(b"NSWorkspace\0")?;
            let workspace = Self::send_id(workspace_class, b"sharedWorkspace\0");
            let notification_center = Self::send_id(workspace, b"notificationCenter\0");
            (!notification_center.is_null()).then_some(notification_center)
        }

        fn focused_xcap_window_rect() -> Option<ActiveWindowRect> {
            xcap::Window::all().ok()?.into_iter().find_map(|window| {
                if !window.is_focused().unwrap_or(false) || window.is_minimized().unwrap_or(true) {
                    return None;
                }

                Self::xcap_window_rect(&window)
            })
        }

        fn xcap_window_rect(window: &xcap::Window) -> Option<ActiveWindowRect> {
            ActiveWindowRect::new(
                window.x().ok()?,
                window.y().ok()?,
                window.width().ok()?,
                window.height().ok()?,
            )
        }
    }

    pub struct PlatformActiveWindowListener {
        observer: ObjectiveCId,
        context: *mut MacActiveWindowContext,
    }

    impl PlatformActiveWindowListener {
        fn new(observer: ObjectiveCId, context: *mut MacActiveWindowContext) -> Self {
            Self { observer, context }
        }

        fn emit_current_focus(&self) {
            if self.context.is_null() {
                return;
            }

            unsafe {
                (*self.context).emit_current_focus();
            }
        }
    }

    impl Drop for PlatformActiveWindowListener {
        fn drop(&mut self) {
            let Some(_pool) = AutoreleasePool::new() else {
                return;
            };
            if !self.observer.is_null() {
                if let Some(notification_center) =
                    PlatformActiveWindowDetector::workspace_notification_center()
                {
                    PlatformActiveWindowDetector::send_void_id(
                        notification_center,
                        b"removeObserver:\0",
                        self.observer,
                    );
                }
                PlatformActiveWindowDetector::send_void(self.observer, b"release\0");
            }
            if !self.context.is_null() {
                unsafe {
                    drop(Box::from_raw(self.context));
                }
                self.context = std::ptr::null_mut();
            }
        }
    }

    struct MacActiveWindowContext {
        callback: FocusCallback,
    }

    impl MacActiveWindowContext {
        fn new(callback: FocusCallback) -> Self {
            Self { callback }
        }

        fn emit_current_focus(&self) {
            let focused = PlatformActiveWindowDetector::focused_window_info()
                .ok()
                .flatten()
                .as_ref()
                .is_some_and(ActiveWindowInfo::is_sc2_window);
            (self.callback)(focused);
        }
    }

    unsafe extern "C" fn active_application_changed(
        observer: ObjectiveCId,
        _selector: ObjectiveCSelector,
        _notification: ObjectiveCId,
    ) {
        let mut context = std::ptr::null_mut();
        unsafe {
            object_getInstanceVariable(observer, b"context\0".as_ptr().cast(), &mut context);
        }
        if context.is_null() {
            return;
        }

        unsafe {
            (*(context as *mut MacActiveWindowContext)).emit_current_focus();
        }
    }

    struct AutoreleasePool {
        value: ObjectiveCId,
    }

    impl AutoreleasePool {
        fn new() -> Option<Self> {
            let class = PlatformActiveWindowDetector::class(b"NSAutoreleasePool\0")?;
            let allocated = PlatformActiveWindowDetector::send_id(class, b"alloc\0");
            let value = PlatformActiveWindowDetector::send_id(allocated, b"init\0");
            (!value.is_null()).then_some(Self { value })
        }
    }

    impl Drop for AutoreleasePool {
        fn drop(&mut self) {
            PlatformActiveWindowDetector::send_void(self.value, b"drain\0");
        }
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod platform {
    use std::thread;
    use std::time::Duration;

    use super::{ActiveWindowInfo, ActiveWindowRect, FocusCallback};

    pub struct PlatformActiveWindowDetector;

    impl PlatformActiveWindowDetector {
        pub fn focused_window_info() -> Result<Option<ActiveWindowInfo>, String> {
            let windows = xcap::Window::all().map_err(|error| {
                format!("Failed to enumerate windows for active window: {error}")
            })?;

            Ok(windows.into_iter().find_map(|window| {
                if !window.is_focused().unwrap_or(false) || window.is_minimized().unwrap_or(true) {
                    return None;
                }

                Some(ActiveWindowInfo::new_with_rect(
                    window.app_name().unwrap_or_default(),
                    window.title().unwrap_or_default(),
                    Self::xcap_window_rect(&window),
                ))
            }))
        }

        pub fn spawn_focus_listener(
            callback: FocusCallback,
        ) -> Result<PlatformActiveWindowListener, String> {
            let join_handle = thread::Builder::new()
                .name("sco-active-window-listener".to_string())
                .spawn(move || {
                    let mut previous_focus = None::<bool>;
                    loop {
                        let focused = Self::focused_window_info()
                            .ok()
                            .flatten()
                            .as_ref()
                            .is_some_and(ActiveWindowInfo::is_sc2_window);
                        if previous_focus != Some(focused) {
                            callback(focused);
                            previous_focus = Some(focused);
                        }
                        thread::sleep(Duration::from_millis(500));
                    }
                })
                .map_err(|error| format!("Failed to spawn active window listener: {error}"))?;

            Ok(PlatformActiveWindowListener::new(join_handle))
        }

        fn xcap_window_rect(window: &xcap::Window) -> Option<ActiveWindowRect> {
            ActiveWindowRect::new(
                window.x().ok()?,
                window.y().ok()?,
                window.width().ok()?,
                window.height().ok()?,
            )
        }
    }

    pub struct PlatformActiveWindowListener {
        _join_handle: thread::JoinHandle<()>,
    }

    impl PlatformActiveWindowListener {
        fn new(join_handle: thread::JoinHandle<()>) -> Self {
            Self {
                _join_handle: join_handle,
            }
        }
    }
}
