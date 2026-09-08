const os = require('os');
const path = require('path');

const AUTH_TOKEN_FILE = path.join(os.tmpdir(), 'tabz-auth-token');

module.exports = { AUTH_TOKEN_FILE };
