export interface TabContextFields {
    tabId?: number;
    tabTitle?: string;
    tabUrl?: string;
    openedTab?: {
        tabId: number;
        title?: string;
        url?: string;
        active?: boolean;
    };
    navigatedTo?: string;
}
export declare function tabHeaderLine(tabId: number | undefined, title?: string, url?: string): string | null;
export declare function tabContextLines(fields: TabContextFields): string[];
export declare function withTabContext(fields: TabContextFields, body: string): string;
export declare function pickTabContext(fields: TabContextFields): TabContextFields;
//# sourceMappingURL=tab-context.d.ts.map