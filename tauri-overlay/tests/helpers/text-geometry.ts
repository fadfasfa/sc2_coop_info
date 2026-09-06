import type { Page } from "@playwright/test";

/** Measure painted text fragments, not container boxes that can hide collisions. */
export async function textGeometry(page: Page, selector: string) {
    return page.evaluate((selector) => {
        const nodes = new Set<Text>();
        for (const element of document.querySelectorAll(selector)) {
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
            );
            while (walker.nextNode()) nodes.add(walker.currentNode as Text);
        }
        const fragments = [...nodes].flatMap((node, nodeId) => {
            if (!node.textContent?.trim() || !node.parentElement) return [];
            const style = getComputedStyle(node.parentElement);
            if (style.visibility === "hidden" || style.display === "none")
                return [];
            const range = document.createRange();
            range.selectNodeContents(node);
            return [...range.getClientRects()]
                .filter((rect) => rect.width > 0 && rect.height > 0)
                .map((rect) => ({
                    nodeId,
                    text: node.textContent!.trim(),
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                }));
        });
        const collisions: {
            first: string;
            second: string;
            x: number;
            y: number;
        }[] = [];
        for (let i = 0; i < fragments.length; i++) {
            for (let j = i + 1; j < fragments.length; j++) {
                const first = fragments[i],
                    second = fragments[j];
                if (first.nodeId === second.nodeId) continue;
                const x =
                    Math.min(first.right, second.right) -
                    Math.max(first.left, second.left);
                const y =
                    Math.min(first.bottom, second.bottom) -
                    Math.max(first.top, second.top);
                if (x > 1 && y > 1)
                    collisions.push({
                        first: first.text,
                        second: second.text,
                        x,
                        y,
                    });
            }
        }
        return {
            fragments,
            collisions,
            horizontalOverflow: fragments.filter(
                (rect) => rect.left < -1 || rect.right > innerWidth + 1,
            ),
            verticalOverflow: fragments.filter(
                (rect) => rect.top < -1 || rect.bottom > innerHeight + 1,
            ),
            maxBottom: Math.max(0, ...fragments.map((rect) => rect.bottom)),
            width: innerWidth,
            height: innerHeight,
        };
    }, selector);
}
