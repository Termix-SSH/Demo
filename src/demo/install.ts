// Each import installs itself, before any core module creates its axios
// instances or opens a socket.
import "./backend/adapter";
import "./backend/sockets";
import "./backend/fetch";
import "./backend/routes";
