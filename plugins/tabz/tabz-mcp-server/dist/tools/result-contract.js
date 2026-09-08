const TRANSPORT_ERROR = /timed? ?out|timeout|cannot connect|connection (?:closed|lost|gone|failed)|socket|transport|backend not fully initialized|browser may not be responding/i;
const UNCERTAIN_MUTATION = /outcome (?:is|remains) unknown|could not be verified|verification (?:was )?interrupted|may have changed the page/i;
const REFUSAL_ERROR = /refused|outside (?:your|the target|this connection's) group|extension page|not allowed|not whitelisted|protected document/i;
const NOT_FOUND_ERROR = /^(?:element not found(?::|$)|no active tab found$|no current tab(?::|$)|tab \d+ not found(?:[.:]|$)|group \d+ not found$|element does not exist$)/i;
export function readFailureStatus(error, transportError = false) {
    if (transportError || TRANSPORT_ERROR.test(error ?? ""))
        return "transport_error";
    if (REFUSAL_ERROR.test(error ?? ""))
        return "refused";
    if (NOT_FOUND_ERROR.test(error ?? ""))
        return "not_found";
    return "failed";
}
export function mutationFailureStatus(error, transportError = false) {
    if (transportError || TRANSPORT_ERROR.test(error ?? "") || UNCERTAIN_MUTATION.test(error ?? ""))
        return "unknown";
    if (REFUSAL_ERROR.test(error ?? ""))
        return "refused";
    if (NOT_FOUND_ERROR.test(error ?? ""))
        return "not_found";
    return "failed";
}
export function structuredToolResult(text, status, fields, isError) {
    return {
        content: [{ type: "text", text }],
        structuredContent: { status, ...fields, text },
        isError
    };
}
//# sourceMappingURL=result-contract.js.map