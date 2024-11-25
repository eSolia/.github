import "lume/types.ts";
import date from "lume/plugins/date.ts";
import { enUS } from "npm:date-fns/locale/en-US";
import { ja } from "npm:date-fns/locale/ja";

/** Configure the site */
export default function () {
  return (site: Lume.Site) => {
    site.use(date({ locales: { enUS, ja } }))
  };
}