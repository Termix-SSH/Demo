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

## Other commands

```sh
npm run build        # typecheck, then build to dist/
npm run typecheck    # tsc only
npm run lint         # eslint
npm run lint:fix     # eslint with --fix
npm run format       # prettier --write
npm run format:check # prettier --check
npm run preview      # serve the built dist/
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
