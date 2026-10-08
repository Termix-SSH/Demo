// Dynamic imports, one after another: in a production bundle a static import
// graph runs shared chunks first, which would let core create its axios
// instances before the fake backend is in place.
void import("./install")
  .then(() => import("./plugins"))
  .then(({ configureDemoPlugins }) => {
    configureDemoPlugins();
    return import("../main.tsx");
  });
