export class TabzClientError extends Error {
    exitCode;
    constructor(message, exitCode, options) {
        super(message, options);
        this.exitCode = exitCode;
        this.name = new.target.name;
    }
}
export class TabzToolError extends TabzClientError {
    result;
    constructor(message, result) {
        super(message, 1);
        this.result = result;
    }
}
export class TabzUsageError extends TabzClientError {
    constructor(message, options) {
        super(message, 2, options);
    }
}
export class TabzTransportError extends TabzClientError {
    constructor(message, options) {
        super(message, 3, options);
    }
}
export class TabzUncertainMutationError extends TabzClientError {
    toolName;
    constructor(message, toolName, options) {
        super(message, 4, options);
        this.toolName = toolName;
    }
}
//# sourceMappingURL=errors.js.map