# Contributing

This is the public demo of [Termix](https://github.com/Termix-SSH/Termix), self-hosted, plugin-based server management, live at [demo.termix.site](https://demo.termix.site/).

## Prerequisites

- [Node.js](https://nodejs.org/en/download/) (built with v24)
- [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [Git](https://git-scm.com/downloads)

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/Termix-SSH/Demo
   ```
2. Install the dependencies:
   ```sh
   npm install
   ```

## Running the development server

Run the following command:

```sh
npm run dev
```

This starts the Vite dev server. The demo runs entirely in the browser, so there is no
backend to start. Open `http://localhost:5173/` and sign in with any username and password.

## How it works

The demo runs the real Termix interface and the real plugin frontends. Only
the server is fake: a small backend inside the page answers every request,
WebSocket and event stream with made-up data.

- `src/ui`, `src/types`, `src/main.tsx`, `src/sdk` and `src/plugins` are copied
  from Termix and its plugins. Never edit them here; change them upstream and
  sync.
- `src/demo` is the demo's own code: the fake backend (`backend/`), its data
  (`fixtures/`) and a tiny `Demo` plugin with the login hint and the reset
  button.

## Updating to a new Termix

With [Termix](https://github.com/Termix-SSH/Termix), the plugin repos and
[Termix-Registry](https://github.com/Termix-SSH/Termix-Registry) checked out
next to this repo (`../Termix`, `../Termix-Plugins/Plugin-*`,
`../Termix-Registry`):

```sh
npm run sync
```

It copies everything over and lists any npm packages the new code imports
that are not installed yet. Then run `npm run dev` and open the browser
console: a request the fake backend does not answer yet is logged as
`[demo] unhandled ...`. Add a route for it under `src/demo/backend/routes`.

## Other commands

```sh
npm run build        # typecheck, then build to dist/
npm run typecheck    # tsc only
npm run lint         # eslint
npm run lint:fix     # eslint with --fix
npm run format       # prettier --write
npm run format:check # prettier --check
npm run preview      # serve the built dist/
npm run sync         # copy Termix and its plugins in again
```

Commits are checked by commitlint and must follow
[Conventional Commits](https://www.conventionalcommits.org/), for example
`fix: stop the rail collapsing on mobile`. Staged files are formatted and linted
automatically on commit.

## Making a change

1. **Fork the repository**: Click "Fork" at the top right of the [repository page](https://github.com/Termix-SSH/Demo).
2. **Create a branch**:
   ```sh
   git checkout -b feature/my-new-feature
   ```
3. **Make your changes**.
4. **Commit your changes**:
   ```sh
   git commit -m "feat: add my new feature"
   ```
5. **Push to your fork**:
   ```sh
   git push origin feature/my-new-feature
   ```
6. **Open a pull request** with a clear description.

## Support

The demo runs Termix, so bugs and ideas go in the [Termix repo](https://github.com/Termix-SSH/Termix/issues/new/choose). Please be as detailed as possible, preferably in English. You can also ask in the [Discord](https://discord.gg/jVQGdvHDrf) server.
