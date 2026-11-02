(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // ../node_modules/skystream-extractors/dist/index.js
  var dist_exports = {};
  __export(dist_exports, {
    DoodExtractor: () => DoodExtractor,
    ExtractorApi: () => ExtractorApi,
    Filemoon: () => Filemoon,
    HubCloud: () => HubCloud,
    JsHunter: () => JsHunter,
    JsUnpacker: () => JsUnpacker,
    M3u8Helper: () => M3u8Helper,
    MixDrop: () => MixDrop,
    PixelDrain: () => PixelDrain,
    PixelDrainDev: () => PixelDrainDev,
    Qualities: () => Qualities,
    StreamTape: () => StreamTape,
    SubtitleHelper: () => SubtitleHelper,
    Voe: () => Voe,
    httpsify: () => httpsify,
    imdbUrlToId: () => imdbUrlToId,
    qualityFromString: () => qualityFromString
  });

  // ../node_modules/skystream-extractors/dist/core/extractor_api.js
  var ExtractorApi = class {
    fixUrl(url) {
      if (url.startsWith("http"))
        return url;
      if (url.startsWith("//"))
        return `https:${url}`;
      if (url.startsWith("/"))
        return `${this.mainUrl}${url}`;
      return `${this.mainUrl}/${url}`;
    }
  };

  // ../node_modules/skystream-extractors/dist/core/qualities.js
  var Qualities = {
    Unknown: 400,
    P144: 144,
    P240: 240,
    P360: 360,
    P480: 480,
    P720: 720,
    P1080: 1080,
    P2160: 2160
  };
  function qualityFromString(name) {
    if (!name)
      return Qualities.Unknown;
    if (/4k/i.test(name))
      return Qualities.P2160;
    return parseInt(name.replace(/p/i, "")) || Qualities.Unknown;
  }

  // ../node_modules/skystream-extractors/dist/utils/js_unpacker.js
  var JsUnpacker = {
    unpack: (js) => {
      return getAndUnpack(js);
    }
  };

  // ../node_modules/skystream-extractors/dist/utils/m3u8_helper.js
  function attributesOf(line) {
    const attributes = {};
    const pattern = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
    const body = line.slice(line.indexOf(":") + 1);
    for (let match = pattern.exec(body); match !== null; match = pattern.exec(body)) {
      attributes[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
    }
    return attributes;
  }
  var M3u8Helper = class {
    /**
     * An HLS playlist's qualities, as links.
     *
     * A master playlist comes back first as itself, named "Auto": SkyStream's
     * player lists its qualities and keeps every audio track. Then one link per
     * height, tallest first, for the variants that carry their own audio: one
     * whose audio is a separate rendition (`#EXT-X-MEDIA:TYPE=AUDIO` with a
     * `URI`) plays silent on its own, so such a master gives the master alone.
     * Of several variants at one height, the highest bandwidth's is kept.
     *
     * A media playlist comes back as itself. I-frame playlists are never links,
     * and an address that doesn't answer with a playlist gives none.
     */
    static async getM3U8Qualities(masterUrl, headers) {
      try {
        const resp = await http_get(masterUrl, headers);
        if (resp.status !== 200 || !resp.body || !resp.body.includes("#EXTM3U"))
          return [];
        const lines = resp.body.split(/\r?\n/).map((line) => line.trim());
        const link = (url, name, quality) => ({
          name,
          source: "M3u8Helper",
          url,
          quality,
          type: "m3u8",
          headers
        });
        if (!lines.some((line) => line.startsWith("#EXT-X-STREAM-INF"))) {
          return [link(masterUrl, "M3U8", Qualities.Unknown)];
        }
        const separateAudio = /* @__PURE__ */ new Set();
        for (const line of lines) {
          if (!line.startsWith("#EXT-X-MEDIA:"))
            continue;
          const media = attributesOf(line);
          if (media["TYPE"] === "AUDIO" && media["GROUP-ID"] && media["URI"]) {
            separateAudio.add(media["GROUP-ID"]);
          }
        }
        const variants = [];
        let pending = null;
        for (const line of lines) {
          if (line.startsWith("#EXT-X-STREAM-INF")) {
            pending = attributesOf(line);
          } else if (pending && line && !line.startsWith("#")) {
            const resolution = /^\d+x(\d+)$/.exec(pending["RESOLUTION"] ?? "");
            variants.push({
              url: new URL(line, masterUrl).toString(),
              height: resolution ? parseInt(resolution[1], 10) : void 0,
              name: pending["NAME"],
              bandwidth: parseInt(pending["BANDWIDTH"] ?? "", 10) || 0,
              audioGroup: pending["AUDIO"]
            });
            pending = null;
          }
        }
        const byQuality = /* @__PURE__ */ new Map();
        for (const variant of variants) {
          if (variant.audioGroup !== void 0 && separateAudio.has(variant.audioGroup))
            continue;
          const quality = variant.height ?? (variant.name ? qualityFromString(variant.name) : Qualities.Unknown);
          const kept = byQuality.get(quality);
          if (!kept || variant.bandwidth > kept.bandwidth)
            byQuality.set(quality, variant);
        }
        const rank = (quality) => quality === Qualities.Unknown ? -1 : quality;
        const split = [...byQuality.entries()].sort(([a], [b]) => rank(b) - rank(a)).map(([quality, variant]) => link(variant.url, "M3U8", quality));
        return [link(masterUrl, "Auto", Qualities.Unknown), ...split];
      } catch (e) {
        console.error("[M3u8Helper] getM3U8Qualities error:", e);
        return [];
      }
    }
  };

  // ../node_modules/skystream-extractors/dist/utils/js_hunter.js
  var JsHunter = class {
    static findFromJs(js, variableName) {
      try {
        const regex = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\]|{[\\s\\S]*?});?`);
        const match = regex.exec(js);
        if (match) {
          let jsonStr = match[1].replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
          jsonStr = jsonStr.replace(/'/g, '"');
          return JSON.parse(jsonStr);
        }
      } catch (e) {
        console.error("[JsHunter] findFromJs error:", e);
      }
      return null;
    }
  };

  // ../node_modules/skystream-extractors/dist/utils/subtitle_helper.js
  var SubtitleHelper = class {
    static fromLanguageToTagIETF(lang) {
      const lower = lang.toLowerCase();
      if (lower === "english")
        return "en";
      if (lower === "spanish")
        return "es";
      if (lower === "hindi")
        return "hi";
      if (lower === "japanese")
        return "ja";
      return lower.substring(0, 2);
    }
    static fromTagToEnglishLanguageName(tag) {
      const lower = tag.toLowerCase();
      if (lower === "en")
        return "English";
      if (lower === "es")
        return "Spanish";
      if (lower === "hi")
        return "Hindi";
      if (lower === "ja")
        return "Japanese";
      return tag;
    }
    static getFlagFromIso(tag) {
      if (tag === "en")
        return "\u{1F1FA}\u{1F1F8}";
      if (tag === "ja")
        return "\u{1F1EF}\u{1F1F5}";
      if (tag === "hi")
        return "\u{1F1EE}\u{1F1F3}";
      return "\u{1F3F3}\uFE0F";
    }
  };

  // ../node_modules/skystream-extractors/dist/utils/url_utils.js
  function httpsify(url) {
    if (!url)
      return "";
    if (url.startsWith("//"))
      return `https:${url}`;
    return url;
  }
  function imdbUrlToId(url) {
    if (!url)
      return null;
    const match = /title\/(tt\d+)/.exec(url);
    return match ? match[1] : null;
  }

  // ../node_modules/skystream-extractors/dist/extractors/hub_cloud.js
  var HubCloud = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "HubCloud";
      this.mainUrl = "https://hubcloud.club";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url, referer ? { Referer: referer } : {});
      if (res.status !== 200)
        return [];
      let finalPageBody = res.body;
      const downloadBtn = await parse_html(res.body, "a#download", "href");
      if (downloadBtn && downloadBtn.length > 0 && downloadBtn[0].attr) {
        let nextUrl = downloadBtn[0].attr;
        if (nextUrl.startsWith("/")) {
          nextUrl = `https://${new URL(url).hostname}${nextUrl}`;
        }
        const nextRes = await http_get(nextUrl, { Referer: url });
        if (nextRes.status === 200) {
          finalPageBody = nextRes.body;
        }
      }
      const serverLinks = await parse_html(finalPageBody, "a.btn", "href");
      const results = [];
      for (const link of serverLinks) {
        const href = link.attr;
        const text = link.text || "HubCloud Server";
        if (!href || href.startsWith("/") || href.includes("winexch") || href.includes("tinyurl"))
          continue;
        results.push({
          name: "HubCloud",
          source: text.replace("Download", "").replace(/[\[\]]/g, "").trim() || "HubCloud",
          url: href,
          quality: qualityFromString("Unknown"),
          type: "video",
          headers: { Referer: this.mainUrl }
        });
      }
      return results;
    }
  };

  // ../node_modules/skystream-extractors/dist/extractors/mix_drop.js
  var MixDrop = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "MixDrop";
      this.mainUrl = "https://mixdrop.co";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url, referer ? { Referer: referer } : {});
      if (res.status !== 200)
        return [];
      const unpacked = JsUnpacker.unpack(res.body);
      const match = /wurl="(https?:[^"]+)"/.exec(unpacked);
      if (!match)
        return [];
      let finalUrl = match[1];
      if (finalUrl.startsWith("//")) {
        finalUrl = "https:" + finalUrl;
      }
      return [{
        name: "MixDrop",
        source: "MixDrop",
        url: finalUrl,
        quality: Qualities.Unknown,
        type: "video",
        headers: { Referer: this.mainUrl }
      }];
    }
  };

  // ../node_modules/skystream-extractors/dist/extractors/voe.js
  var Voe = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "Voe";
      this.mainUrl = "https://voe.sx";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url);
      if (res.status !== 200)
        return [];
      const hlsMatch = /'hls':\s*'([^']+)'/.exec(res.body) || /"hls":\s*"([^"]+)"/.exec(res.body);
      const videoUrl = hlsMatch ? hlsMatch[1] : null;
      if (!videoUrl)
        return [];
      return [{
        name: this.name,
        source: this.name,
        url: videoUrl,
        quality: Qualities.Unknown,
        type: "m3u8",
        headers: { Referer: this.mainUrl }
      }];
    }
  };

  // ../node_modules/skystream-extractors/dist/extractors/stream_tape.js
  var StreamTape = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "StreamTape";
      this.mainUrl = "https://streamtape.com";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url);
      if (res.status !== 200)
        return [];
      const robotLinkElements = await parse_html(res.body, "#norobotlink", "innerHTML");
      if (!robotLinkElements || robotLinkElements.length === 0)
        return [];
      const innerHtml = robotLinkElements[0].html;
      const part1Match = /'([^']+)'/.exec(innerHtml) || /"([^"]+)"/.exec(innerHtml);
      const part2Match = /innerHTML\s*=\s*['"](.*?)['"]\s*\+\s*\(['"](.*?)['"]/.exec(res.body);
      let videoUrl = "";
      if (part2Match) {
        videoUrl = `https:${part2Match[1]}${part2Match[2]}`;
      } else if (part1Match) {
        videoUrl = `https:${part1Match[1]}`;
      }
      if (!videoUrl || videoUrl === "https:")
        return [];
      const finalUrl = videoUrl.replace(/&amp;/g, "&");
      return [{
        name: this.name,
        source: this.name,
        url: finalUrl,
        quality: Qualities.Unknown,
        type: "video",
        headers: { Referer: this.mainUrl }
      }];
    }
  };

  // ../node_modules/skystream-extractors/dist/extractors/filemoon.js
  var Filemoon = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "Filemoon";
      this.mainUrl = "https://filemoon.sx";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url);
      if (res.status !== 200)
        return [];
      let body = res.body;
      if (body.includes("p,a,c,k,e,d")) {
        body = JsUnpacker.unpack(body);
      }
      const fileMatch = /file:\s*["']([^"']+\.m3u8[^"']*)["']/.exec(body);
      if (!fileMatch)
        return [];
      const m3u8Url = fileMatch[1];
      return await M3u8Helper.getM3U8Qualities(m3u8Url, { Referer: this.mainUrl });
    }
  };

  // ../node_modules/skystream-extractors/dist/extractors/dood_extractor.js
  var DoodExtractor = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "DoodStream";
      this.mainUrl = "https://dood.watch";
      this.requiresReferer = false;
    }
    async getUrl(url, referer) {
      const res = await http_get(url);
      if (res.status !== 200)
        return [];
      const md5Match = /\/pass_md5\/[^']*/.exec(res.body);
      if (!md5Match)
        return [];
      const md5Url = `https://${new URL(url).hostname}${md5Match[0]}`;
      const md5Res = await http_get(md5Url, { Referer: url });
      const tokenMatch = /token=([^&]+)/.exec(md5Url);
      const token = tokenMatch ? tokenMatch[1] : "";
      function makeid(length) {
        let result = "";
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < length; i++) {
          result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
      }
      const videoUrl = md5Res.body + makeid(10) + "?token=" + token + "&expiry=" + Date.now();
      return [{
        name: this.name,
        source: this.name,
        url: videoUrl,
        quality: Qualities.Unknown,
        type: "video",
        headers: { Referer: url }
      }];
    }
  };

  // ../node_modules/skystream-extractors/dist/extractors/pixel_drain.js
  var PixelDrain = class extends ExtractorApi {
    constructor() {
      super(...arguments);
      this.name = "PixelDrain";
      this.mainUrl = "https://pixeldrain.com";
      this.requiresReferer = true;
    }
    async getUrl(url, referer) {
      const match = /\/u\/(.*)/.exec(url);
      const mId = match ? match[1] : null;
      let streamUrl = url;
      if (mId) {
        streamUrl = `${this.mainUrl}/api/file/${mId}?download`;
      }
      return [{
        name: this.name,
        source: this.name,
        url: streamUrl,
        quality: Qualities.Unknown,
        type: "video",
        headers: {
          Referer: url
        }
      }];
    }
  };
  var PixelDrainDev = class extends PixelDrain {
    constructor() {
      super(...arguments);
      this.name = "PixelDrainDev";
      this.mainUrl = "https://pixeldrain.dev";
    }
  };

  // src/index.js
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  var BASE = () => manifest.baseUrl.replace(/\/+$/, "");
  var LANGS = { 1: "GerDub", 3: "GerSub", 2: "EngSub" };
  var DEFAULT_PRIORITY = ["voe", "filemoon", "vidmoly", "doodstream", "streamtape", "vidoza", "vinovo"];
  var MAX_SEASONS = 40;
  function setting(key, fallback) {
    try {
      const sources = [
        globalThis.settings,
        globalThis.pluginSettings,
        globalThis.SKY_SETTINGS,
        manifest && manifest.settings,
        manifest && manifest.config
      ];
      for (const src of sources) {
        if (!src || typeof src !== "object") continue;
        const v = src[key];
        if (v !== void 0 && v !== null && v !== "") return v;
      }
    } catch {
    }
    return fallback;
  }
  var asBool = (v, fb = false) => {
    if (v === void 0 || v === null || v === "") return fb;
    if (typeof v === "boolean") return v;
    return ["1", "true", "yes", "on", "ja"].includes(String(v).toLowerCase());
  };
  var asInt = (v, fb, min, max) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fb;
    return Math.min(max, Math.max(min, n));
  };
  var asList = (v) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  function langChain() {
    if (asBool(setting("onlyDub", false))) return [1];
    const pref = String(setting("language", "dub")).toLowerCase();
    if (pref === "sub") return [3, 2, 1];
    if (pref === "both") return [1, 3, 2];
    return [1, 3, 2];
  }
  function hosterPriority() {
    const list = asList(setting("hosterPriority", ""));
    return list.length ? list : DEFAULT_PRIORITY;
  }
  function hosterAllowed(hoster) {
    const black = asList(setting("hosterBlacklist", ""));
    const h = hoster.toLowerCase();
    return !black.some((b) => h.includes(b));
  }
  async function get(url, opts = {}) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "de-DE,de;q=0.9",
        Referer: BASE() + "/",
        ...opts.headers || {}
      },
      ...opts.redirect ? { redirect: opts.redirect } : {}
    });
    if (typeof res === "string") return res;
    if (res && typeof res.text === "function") return await res.text();
    if (res && typeof res.body === "string") return res.body;
    return "";
  }
  var abs = (u) => !u ? "" : /^https?:/i.test(u) ? u : BASE() + (u.startsWith("/") ? u : "/" + u);
  var clean = (s = "") => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  function dedupe(items, key = "url") {
    const seen = /* @__PURE__ */ new Set();
    return items.filter((i) => {
      const k = typeof key === "function" ? key(i) : i[key];
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  function parseTiles(html) {
    const out = [];
    const re = /<a[^>]+href="([^"]*\/anime\/stream\/[^"#?]+)"[^>]*>([\s\S]{0,800}?)<\/a>/g;
    let m;
    while (m = re.exec(html)) {
      if (/\/staffel-|\/episode-/.test(m[1])) continue;
      const chunk = m[2];
      const img = /(?:data-src|src)="([^"]+\.(?:png|jpe?g|webp)[^"]*)"/.exec(chunk);
      const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(chunk);
      const tAttr = /title="([^"]+)"/.exec(m[0]);
      const title = clean(h3 && h3[1] || tAttr && tAttr[1] || m[1].split("/").pop());
      if (!title) continue;
      out.push(new MultimediaItem({
        title,
        url: abs(m[1]),
        posterUrl: img ? abs(img[1]) : "",
        type: "anime"
      }));
    }
    return dedupe(out);
  }
  async function getHome(cb) {
    try {
      const rows = asInt(setting("homeRows", 4), 4, 0, 8);
      const data = {};
      const [pop, neu, genresHtml] = await Promise.all([
        get(BASE() + "/beliebte-animes"),
        get(BASE() + "/neu"),
        rows > 0 ? get(BASE() + "/animes") : Promise.resolve("")
      ]);
      data["Trending"] = parseTiles(pop).slice(0, 20);
      data["Neu"] = parseTiles(neu).slice(0, 20);
      const genres = dedupe(
        [...genresHtml.matchAll(/href="[^"]*\/genre\/([a-z0-9-]+)"[^>]*>([^<]+)</g)].map((g) => ({
          slug: g[1],
          name: clean(g[2])
        })),
        (g) => g.slug
      ).slice(0, rows);
      for (const g of genres) {
        try {
          data[g.name] = parseTiles(await get(`${BASE()}/genre/${g.slug}`)).slice(0, 20);
        } catch {
        }
      }
      const cleaned = Object.fromEntries(Object.entries(data).filter(([, v]) => v && v.length));
      cb({ success: true, data: cleaned });
    } catch (e) {
      cb({ success: false, message: String(e) });
    }
  }
  async function search(query, cb) {
    try {
      const html = await get(`${BASE()}/search?q=${encodeURIComponent(query)}`);
      cb({ success: true, data: parseTiles(html) });
    } catch (e) {
      cb({ success: false, message: String(e) });
    }
  }
  async function load(url, cb) {
    try {
      const html = await get(url);
      const cover = /class="seriesCoverBox"[\s\S]{0,300}?(?:data-src|src)="([^"]+)"/.exec(html);
      const title = /<h1[^>]*>\s*<span>([\s\S]*?)<\/span>/.exec(html);
      const desc = /data-full-description="([^"]*)"/.exec(html);
      const year = /\/animes\/jahr\/(\d{4})/.exec(html);
      const fsk = /data-fsk="(\d+)"/.exec(html);
      const genreList = [...html.matchAll(/href="[^"]*\/genre\/([a-z0-9-]+)"[^>]*>([^<]+)</g)].map((g) => clean(g[2]));
      const item = new MultimediaItem({
        title: clean(title ? title[1] : url.split("/").pop()),
        url,
        posterUrl: cover ? abs(cover[1]) : "",
        type: "anime",
        description: clean(desc ? desc[1] : "") + (genreList.length ? `

Genres: ${genreList.join(", ")}` : ""),
        year: year ? Number(year[1]) : void 0,
        contentRating: fsk ? `FSK ${fsk[1]}` : void 0,
        status: "ongoing"
      });
      const allowSpecials = asBool(setting("includeSpecials", true), true);
      const allowMovies = asBool(setting("includeMovies", true), true);
      const seasons = dedupe(
        [...html.matchAll(/href="([^"]*\/(?:staffel-\d+|filme))"/g)].map((m) => abs(m[1]))
      ).filter((u) => allowSpecials || !/staffel-0\/?$/.test(u)).filter((u) => allowMovies || !/\/filme\/?$/.test(u)).slice(0, MAX_SEASONS);
      const episodes = [];
      for (const seasonUrl of seasons) {
        const sNum = (/staffel-(\d+)/.exec(seasonUrl) || [, "0"])[1];
        let sHtml;
        try {
          sHtml = await get(seasonUrl);
        } catch {
          continue;
        }
        const seen = /* @__PURE__ */ new Set();
        for (const e of sHtml.matchAll(/href="([^"]+\/episode-(\d+))"/g)) {
          const epUrl = abs(e[1]);
          if (seen.has(epUrl)) continue;
          seen.add(epUrl);
          episodes.push(new Episode({
            name: `S${String(sNum).padStart(2, "0")}E${String(e[2]).padStart(2, "0")}`,
            url: epUrl,
            season: Number(sNum),
            episode: Number(e[2]),
            dubStatus: "none"
          }));
        }
      }
      if (!episodes.length) {
        return cb({ success: false, errorCode: "NOT_FOUND", message: "Keine Episoden gefunden" });
      }
      item.episodes = episodes;
      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, message: String(e) });
    }
  }
  async function resolveRedirect(redirectUrl) {
    const body = await get(redirectUrl, { headers: { Referer: BASE() + "/" } });
    const patterns = [
      /window\.location\.href\s*=\s*["']([^"']+)["']/i,
      /location\.replace\(\s*["']([^"']+)["']\s*\)/i,
      /http-equiv="refresh"[^>]*content="\d+;\s*url=([^"]+)"/i,
      /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i,
      /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i,
      /<a[^>]+href="(https?:\/\/(?!aniworld)[^"]+)"[^>]*>/i
    ];
    for (const p of patterns) {
      const m = p.exec(body);
      if (m && !/aniworld\.(to|sx|info)/i.test(m[1])) return m[1];
    }
    return null;
  }
  function extractorFor(hostUrl) {
    const map = [
      [/voe\.(sx|com)|voe\./i, ["Voe", "VoeExtractor"]],
      [/filemoon/i, ["Filemoon", "FileMoon", "FilemoonExtractor"]],
      [/vidmoly/i, ["Vidmoly", "VidMoly"]],
      [/dood(stream)?\./i, ["Doodstream", "DoodStream", "Dood"]],
      [/streamtape/i, ["StreamTape", "Streamtape"]],
      [/vidoza/i, ["Vidoza"]]
    ];
    for (const [re, names] of map) {
      if (!re.test(hostUrl)) continue;
      for (const n of names) {
        if (typeof dist_exports[n] === "function") {
          try {
            return new dist_exports[n]();
          } catch {
          }
        }
      }
    }
    return null;
  }
  async function loadStreams(url, cb) {
    try {
      const html = await get(url);
      const ref = BASE() + "/";
      const chain = langChain();
      const priority = hosterPriority();
      const limit = asInt(setting("maxHosters", 10), 10, 1, 30);
      const entries = [...html.matchAll(
        /<li[^>]*data-lang-key="(\d)"[^>]*data-link-target="([^"]+)"[\s\S]{0,500}?<h4>([^<]+)<\/h4>/g
      )].map((m) => ({ lang: Number(m[1]), hoster: clean(m[3]), redirect: abs(m[2]) })).filter((e) => hosterAllowed(e.hoster)).filter((e) => chain.includes(e.lang));
      if (!entries.length) {
        const hint = asBool(setting("onlyDub", false)) ? "Keine GerDub-Quelle vorhanden \u2013 \u201ENur GerDub\u201C deaktivieren" : "Keine passende Quelle gefunden";
        return cb({ success: true, data: [], message: hint });
      }
      const rankLang = (l) => {
        const i = chain.indexOf(l);
        return i < 0 ? 99 : i;
      };
      const rankHost = (h) => {
        const i = priority.findIndex((p) => h.toLowerCase().includes(p));
        return i < 0 ? 99 : i;
      };
      entries.sort((a, b) => rankLang(a.lang) - rankLang(b.lang) || rankHost(a.hoster) - rankHost(b.hoster));
      const strictLang = !asBool(setting("language", "dub") === "both") && !asBool(setting("onlyDub", false), false);
      const bestLang = entries[0].lang;
      const pool = (strictLang ? entries.filter((e) => e.lang === bestLang) : entries).slice(0, limit);
      const streams = [];
      for (const e of pool) {
        const label = `${e.hoster} (${LANGS[e.lang] || "?"})`;
        try {
          const hostUrl = await resolveRedirect(e.redirect);
          if (!hostUrl) continue;
          let links = [];
          try {
            links = await loadExtractor(hostUrl) || [];
          } catch {
          }
          if (!links.length) {
            const ex = extractorFor(hostUrl);
            if (ex) links = await ex.getUrl(hostUrl) || [];
          }
          for (const l of links) {
            const linkUrl = l.url || l.link;
            if (!linkUrl) continue;
            streams.push(new StreamResult({
              url: linkUrl,
              source: label,
              quality: l.quality || "Auto",
              headers: { Referer: ref, "User-Agent": UA, ...l.headers || {} }
            }));
          }
        } catch (err) {
          console.error("Hoster fehlgeschlagen:", label, err);
        }
      }
      cb({
        success: true,
        data: dedupe(streams, (s) => `${s.url}|${s.source}`),
        ...streams.length ? {} : { message: "Alle Hoster fehlgeschlagen \u2013 Domain wechseln?" }
      });
    } catch (e) {
      cb({ success: false, message: String(e) });
    }
  }
  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
