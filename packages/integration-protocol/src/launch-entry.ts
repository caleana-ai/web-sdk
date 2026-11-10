import { EXTENSION_CONTRACT } from "./extension-vocabulary.js";

/** Declared URI syntax only: no normalization, reachability, or IO authority. */
export const isIntegrationLaunchEntry = (value: string): boolean => {
  const { launch } = EXTENSION_CONTRACT;
  const scheme = value.startsWith("https://") ? "https" : value.startsWith("http://") ? "http" : null;
  if (!scheme) return false;
  const remainder = value.slice(scheme.length + 3);
  const boundary = remainder.search(/[/?#]/);
  const authority = boundary < 0 ? remainder : remainder.slice(0, boundary);
  const suffix = boundary < 0 ? "" : remainder.slice(boundary);
  const match = /^(\[::1\]|[A-Za-z0-9.-]+)(?::([1-9][0-9]{0,4}))?$/.exec(authority);
  if (!match || match[0] !== authority) return false;
  const host = match[1]!;
  if (match[2] && Number(match[2]) > launch.maximumPort) return false;
  if (host !== "[::1]") {
    if (host.length > launch.hostLength) return false;
    if (/^[0-9.]+$/.test(host)) {
      const parts = host.split(".");
      if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) return false;
    } else if (host.split(".").some((label) => label.length > launch.labelLength || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return false;
  }
  if (scheme === "http" && !(launch.loopbackHosts as readonly string[]).includes(host)) return false;
  for (let index = 0; index < suffix.length; index++) {
    if (suffix[index] === "%") {
      if (!/^[0-9A-Fa-f]{2}$/.test(suffix.slice(index + 1, index + 3))) return false;
      index += 2;
    } else if (!launch.suffixCharacters.includes(suffix[index]!)) return false;
  }
  return true;
};
