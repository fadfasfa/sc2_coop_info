import * as React from "react";
import {
    createLanguageManager,
    type LanguageManager,
} from "../../i18n/languageManager";
import styles from "../configStyles";

export const TABLE_ROWS_PER_PAGE = 20;

type TablePaginationProps = {
    languageManager?: LanguageManager;
    currentPage: number;
    onPageChange: (page: number) => void;
    totalRows: number;
    rowsPerPage?: number;
    hideWhenSinglePage?: boolean;
};

export function pageCountForRows(
    totalRows: number,
    rowsPerPage: number = TABLE_ROWS_PER_PAGE,
): number {
    if (totalRows <= 0) {
        return 1;
    }
    return Math.ceil(totalRows / rowsPerPage);
}

export function clampPageNumber(page: number, totalPages: number): number {
    if (!Number.isFinite(page)) {
        return 1;
    }
    const normalizedPage = Math.trunc(page);
    if (normalizedPage < 1) {
        return 1;
    }
    if (normalizedPage > totalPages) {
        return totalPages;
    }
    return normalizedPage;
}

export function rowsForPage<T>(
    rows: readonly T[],
    currentPage: number,
    rowsPerPage: number = TABLE_ROWS_PER_PAGE,
): readonly T[] {
    const totalPages = pageCountForRows(rows.length, rowsPerPage);
    const page = clampPageNumber(currentPage, totalPages);
    const startIndex = (page - 1) * rowsPerPage;
    return rows.slice(startIndex, startIndex + rowsPerPage);
}

export function TablePagination({
    currentPage,
    onPageChange,
    totalRows,
    rowsPerPage = TABLE_ROWS_PER_PAGE,
    hideWhenSinglePage = true,
    languageManager = createLanguageManager(),
}: TablePaginationProps) {
    const t = (id: string) => languageManager.translate(id);
    const formatText = (
        id: string,
        values: Record<string, string | number>,
    ): string =>
        Object.entries(values).reduce(
            (text, [key, value]) =>
                text.split(`{{${key}}}`).join(String(value)),
            t(id),
        );
    const totalPages = pageCountForRows(totalRows, rowsPerPage);
    if (hideWhenSinglePage && totalRows <= rowsPerPage) {
        return null;
    }

    const safePage = clampPageNumber(currentPage, totalPages);
    const startRow = (safePage - 1) * rowsPerPage + 1;
    const endRow = Math.min(totalRows, safePage * rowsPerPage);

    return (
        <div className={styles.tablePagination}>
            <p className={styles.tablePaginationSummary}>
                {formatText("ui_table_rows_summary", {
                    start: startRow,
                    end: endRow,
                    total: totalRows,
                })}
            </p>
            <div className={styles.tablePaginationControls}>
                <button
                    type="button"
                    className={[styles.tablePaginationBtn, styles.buttonNormal]
                        .filter(Boolean)
                        .join(" ")}
                    disabled={safePage <= 1}
                    onClick={() => onPageChange(safePage - 1)}
                >
                    {t("ui_common_previous")}
                </button>
                <span className={styles.tablePaginationPage}>
                    {formatText("ui_table_page_summary", {
                        page: safePage,
                        total: totalPages,
                    })}
                </span>
                <button
                    type="button"
                    className={[styles.tablePaginationBtn, styles.buttonNormal]
                        .filter(Boolean)
                        .join(" ")}
                    disabled={safePage >= totalPages}
                    onClick={() => onPageChange(safePage + 1)}
                >
                    {t("ui_common_next")}
                </button>
            </div>
        </div>
    );
}
