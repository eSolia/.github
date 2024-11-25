import lume from "lume/mod.ts";
import plugins from "./plugins.ts";
import { getCurrentVersion } from "lume/core/utils/lume_version.ts";

const site = lume({
    src: "./src",
});

site.use(plugins());
site.data("lumeVersion", getCurrentVersion());

site.ignore("README.md");
site.ignore("*.DS_Store");
site.ignore("archive");

// Script to copy generated readme to the repo profile folder
site.script(
  "copyreadme",
  "cd _site && cp repo-readme.md ../profile/README.md",
);
// Execute scripts after build
site.addEventListener("afterBuild", "copyreadme");

export default site;
