// Code copied in by npm run sync is linted and formatted in its own repo, and
// a sync stages thousands of files, too many for one command line.
const COPIED =
  /[\\/]src[\\/](ui|types|sdk|plugins|synced)[\\/]|[\\/]src[\\/]main\.tsx$|[\\/]public[\\/]fonts[\\/]/;

const quote = (files) => files.map((file) => JSON.stringify(file)).join(" ");

function own(commands) {
  return (files) => {
    const kept = files.filter((file) => !COPIED.test(file));
    return kept.length ? commands.map((cmd) => `${cmd} ${quote(kept)}`) : [];
  };
}

export default {
  "*.{ts,tsx}": own(["eslint --fix", "prettier --write"]),
  "*.{js,jsx,mjs,cjs,json,css,md}": own(["prettier --write"]),
};
