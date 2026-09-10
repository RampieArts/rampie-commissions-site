(() => {
  const WORKS = window.WORKS || { covers: [], video: [], animations: [] };
  const WEBM = /\.webm($|\?)/i;
  const overlay = document.getElementById("work-overlay");
  const overlayPanel = overlay?.querySelector(".work-overlay-panel");
  const overlayBody = overlay?.querySelector("[data-overlay-body]");
  const overlayLabel = overlay?.querySelector("[data-overlay-label]");
  const cta = document.getElementById("copy-discord-cta");
  const toast = document.getElementById("copy-toast");
  let toastTimer = 0;

  const pad = (n) => String(n).padStart(2, "0");

  const copyText = async (text) => {
    if (navigator.clipboard?.writeText) {
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 500)),
        ]);
        return true;
      } catch {
        /* fall through to execCommand */
      }
    }
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(field);
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    try {
      return document.execCommand("copy");
    } finally {
      field.remove();
    }
  };

  const showToast = () => {
    if (!toast) return;
    toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-on"), 1800);
  };

  cta?.addEventListener("click", async () => {
    const handle = cta.dataset.handle || cta.querySelector(".cta-title")?.textContent.trim();
    if (!handle) return;
    showToast();
    await copyText(handle);
  });

  const parseUrl = (url) => {
    const yt = String(url).match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    if (yt) return { type: "youtube", id: yt[1] };
    const tw = String(url).match(
      /(?:twitter\.com|x\.com)\/(?:[^/]+\/status\/|i\/web\/status\/)(\d+)/
    );
    if (tw) return { type: "twitter", id: tw[1] };
    return { type: "link", id: "" };
  };

  const fileName = (path) =>
    decodeURIComponent(String(path).split("/").pop().split("?")[0] || "");

  const prettyName = (path) =>
    fileName(path).replace(/\.webm$/i, "").replace(/[-_]+/g, " ").trim();

  const joinPath = (dir, name) =>
    `${String(dir).replace(/\/+$/, "")}/${String(name).replace(/^\/+/, "")}`;

  const normalize = (item) => {
    if (typeof item === "string") return { url: item, title: "", tags: [] };
    const raw = item.tags ?? item.tag ?? [];
    const tags = (Array.isArray(raw) ? raw : [raw])
      .map((tag) => String(tag).trim())
      .filter(Boolean);
    return {
      url: item.url || item.file || item.src || "",
      title: item.title || "",
      tags,
    };
  };

  const githubRepo = () => {
    const host = location.hostname;
    if (host.endsWith(".github.io")) return `${host.split(".")[0]}/${host}`;
    return "rampiearts/rampiearts.github.io";
  };

  const collectWebmNames = (items) => {
    const names = [];
    const visit = (value) => {
      if (!value) return;
      if (typeof value === "string") {
        if (WEBM.test(value)) names.push(fileName(value));
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === "object") {
        visit(value.file || value.src || value.url || value.name);
      }
    };
    visit(items);
    return names;
  };

  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve([]), ms)),
    ]);

  const listFromJson = async (folder) => {
    try {
      const res = await fetch(joinPath(folder, "list.json"), { cache: "no-store" });
      if (!res.ok) return [];
      return collectWebmNames(await res.json());
    } catch {
      return [];
    }
  };

  const listFromDirectory = async (folder) => {
    try {
      const res = await fetch(`${String(folder).replace(/\/+$/, "")}/`, { cache: "no-store" });
      if (!res.ok) return [];
      const type = res.headers.get("content-type") || "";
      if (type && !/text\/html|text\/plain/i.test(type)) return [];
      const html = await res.text();
      return collectWebmNames(
        [...html.matchAll(/href\s*=\s*["']([^"'?#]+\.webm)["']/gi)].map((m) => m[1])
      );
    } catch {
      return [];
    }
  };

  const listFromGitHub = async (folder) => {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${githubRepo()}/contents/${String(folder).replace(/^\/+|\/+$/g, "")}`
      );
      if (!res.ok) return [];
      const items = await res.json();
      if (!Array.isArray(items)) return [];
      return items
        .filter((f) => f?.type === "file" && WEBM.test(f.name || ""))
        .map((f) => f.name);
    } catch {
      return [];
    }
  };

  const loadFolderWorks = async (folder, extra) => {
    const extraNames = collectWebmNames(extra);
    const [fromJson, fromDir, fromGh] = await Promise.all([
      listFromJson(folder),
      listFromDirectory(folder),
      withTimeout(listFromGitHub(folder), 8000),
    ]);
    const local = [...fromJson, ...fromDir, ...extraNames];
    const listed = local.length ? local : fromGh;
    const meta = new Map();
    (Array.isArray(extra) ? extra : []).forEach((item) => {
      const n = normalize(item);
      const name = fileName(n.url);
      if (!name) return;
      meta.set(name, n);
    });
    const unique = [...new Set(listed.filter(Boolean))];
    unique.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return unique.map((name) => {
      const info = meta.get(name) || {};
      return {
        url: joinPath(folder, name),
        title: info.title || prettyName(name),
        tags: info.tags || [],
      };
    });
  };

  const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  const twitterCache = new Map();

  const pickTwitterVideo = (tweet) => {
    const videos = tweet?.media?.videos || [];
    const first = videos[0];
    if (!first) return { videoUrl: "", width: 0, height: 0 };
    const variants = Array.isArray(first.variants) ? first.variants : [];
    const mp4 = variants
      .filter((item) => /mp4/i.test(String(item.content_type || "")) && item.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    return {
      videoUrl: mp4?.url || first.url || "",
      width: first.width || Number(String(mp4?.url || first.url || "").match(/(\d+)x(\d+)/)?.[1]) || 0,
      height: first.height || Number(String(mp4?.url || first.url || "").match(/(\d+)x(\d+)/)?.[2]) || 0,
    };
  };

  const twitterPreview = async (id) => {
    if (twitterCache.has(id)) return twitterCache.get(id);
    try {
      const res = await fetch(`https://api.fxtwitter.com/status/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const tweet = data.tweet || {};
      const photos = tweet.media?.photos || [];
      const media = pickTwitterVideo(tweet);
      const info = {
        text: tweet.text || "",
        author: tweet.author?.screen_name || "",
        thumb:
          photos[0]?.url ||
          tweet.media?.videos?.[0]?.thumbnail_url ||
          media.videoUrl ||
          null,
        videoUrl: media.videoUrl,
        width: media.width,
        height: media.height,
      };
      twitterCache.set(id, info);
      return info;
    } catch {
      return null;
    }
  };

  const applyMediaRatio = (el, video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h || !el) return;
    el.style.setProperty("--media-w", String(w));
    el.style.setProperty("--media-h", String(h));
    el.style.aspectRatio = `${w} / ${h}`;
  };

  const sourceLabel = (type) => {
    if (type === "youtube") return "YOUTUBE";
    if (type === "twitter") return "X / TWITTER";
    return "LINK";
  };

  let overlayMessage = null;

  const stopOverlayListen = () => {
    if (!overlayMessage) return;
    window.removeEventListener("message", overlayMessage);
    overlayMessage = null;
  };

  const resetOverlayChrome = () => {
    overlayBody.style.removeProperty("--media-w");
    overlayBody.style.removeProperty("--media-h");
    overlayBody.style.removeProperty("aspect-ratio");
    overlayBody.style.removeProperty("height");
    overlayPanel?.classList.remove("is-native", "is-tweet");
  };

  const mountTwitterEmbed = (id) => {
    overlayBody.innerHTML = "";
    overlayBody.style.removeProperty("--media-w");
    overlayBody.style.removeProperty("--media-h");
    overlayBody.style.removeProperty("aspect-ratio");
    overlayPanel?.classList.remove("is-native");
    overlayPanel?.classList.add("is-tweet");
    const frame = document.createElement("iframe");
    frame.src = `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`;
    frame.title = "X / Twitter";
    frame.allow = "autoplay; encrypted-media; fullscreen";
    frame.allowFullscreen = true;
    overlayBody.append(frame);
    bindTweetResize();
  };

  const mountOverlayVideo = (src, opts = {}) => {
    const native = opts.native !== false;
    overlayPanel?.classList.toggle("is-native", native);
    overlayPanel?.classList.remove("is-tweet");
    const video = document.createElement("video");
    video.referrerPolicy = "no-referrer";
    video.setAttribute("referrerpolicy", "no-referrer");
    video.controls = true;
    video.autoplay = true;
    video.loop = !!opts.loop;
    video.muted = !!opts.muted;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    if (opts.muted) video.setAttribute("muted", "");
    if (opts.poster) video.poster = opts.poster;
    if (native && opts.width && opts.height) {
      applyMediaRatio(overlayBody, { videoWidth: opts.width, videoHeight: opts.height });
    }
    video.addEventListener("loadedmetadata", () => {
      if (native) applyMediaRatio(overlayBody, video);
    });
    if (opts.tweetId) {
      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        mountTwitterEmbed(opts.tweetId);
      };
      video.addEventListener("error", fallback);
      video.addEventListener("loadeddata", () => { settled = true; });
      setTimeout(() => {
        if (!settled && video.readyState < 2) fallback();
      }, 2500);
    }
    video.src = src;
    overlayBody.append(video);
    video.play().catch(() => {});
  };

  const bindTweetResize = () => {
    stopOverlayListen();
    overlayMessage = (event) => {
      if (!/twitter\.com|x\.com/i.test(event.origin || "")) return;
      let data = event.data;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== "object") return;
      const params = data.params?.[0] || data["twttr.embed"]?.params?.[0] || data;
      const h = Number(params?.height || data.height);
      if (h > 80) overlayBody.style.height = `${Math.round(h)}px`;
    };
    window.addEventListener("message", overlayMessage);
  };

  const canHotlinkTwimg = /^(localhost|127\.0\.0\.1)?$/i.test(location.hostname);

  const playTwitterVideo = (parsed, info) => {
    if (info?.videoUrl && canHotlinkTwimg) {
      overlayBody.style.removeProperty("height");
      mountOverlayVideo(info.videoUrl, {
        width: info.width,
        height: info.height,
        poster: info.thumb,
        native: (info.height || 0) > (info.width || 0),
        tweetId: parsed.id,
      });
      return;
    }
    mountTwitterEmbed(parsed.id);
  };

  const openTwitter = async (parsed) => {
    overlayPanel?.classList.add("is-tweet");
    const info = await twitterPreview(parsed.id);
    if (overlay.hidden) return;
    overlayBody.innerHTML = "";
    playTwitterVideo(parsed, info);
  };

  const openOverlay = (parsed, title) => {
    if (!overlay || !overlayBody) return;
    overlayBody.innerHTML = "";
    stopOverlayListen();
    resetOverlayChrome();
    overlayLabel.textContent = parsed.type === "webm" ? "" : (title || sourceLabel(parsed.type));
    if (parsed.type === "youtube") {
      const frame = document.createElement("iframe");
      const origin = encodeURIComponent(location.origin);
      frame.src = `https://www.youtube.com/embed/${parsed.id}?autoplay=1&rel=0&origin=${origin}`;
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.title = title || "YouTube";
      overlayBody.append(frame);
    } else if (parsed.type === "twitter") {
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
      const cached = twitterCache.get(parsed.id);
      if (cached) {
        playTwitterVideo(parsed, cached);
        return;
      }
      openTwitter(parsed);
      return;
    } else if (parsed.type === "webm") {
      mountOverlayVideo(parsed.url, { muted: true, loop: true, native: true });
    } else {
      window.open(parsed.url || title, "_blank", "noreferrer");
      return;
    }
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
  };

  const closeOverlay = () => {
    if (!overlay || !overlayBody) return;
    overlay.hidden = true;
    overlayBody.innerHTML = "";
    stopOverlayListen();
    resetOverlayChrome();
    document.body.style.overflow = "";
  };

  const emptyCard = (kind, folder) => {
    const card = document.createElement("div");
    card.className = "work-empty";
    card.innerHTML = folder
      ? `No ${kind} yet. Add <code>.webm</code> files to <code>${folder}</code>.`
      : `No ${kind} yet. Add YouTube or X links in <code>data/works.js</code>.`;
    return card;
  };

  const makeTags = (tags) => {
    if (!tags.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "work-tags";
    tags.forEach((tag) => {
      const mark = document.createElement("span");
      mark.className = "work-tag";
      mark.textContent = tag;
      wrap.append(mark);
    });
    return wrap;
  };

  const bindVideoPlayback = (video) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    if (!("IntersectionObserver" in window)) {
      video.autoplay = true;
      video.play().catch(() => {});
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) video.play().catch(() => {});
          else video.pause();
        });
      },
      { threshold: 0.25 }
    );
    io.observe(video);
  };

  const makeCard = (item, index) => {
    const { url, title, tags } = normalize(item);
    const isWebm = WEBM.test(url);
    const parsed = isWebm ? { type: "webm", id: "" } : parseUrl(url);
    const card = document.createElement("article");
    card.className = isWebm ? "work-card is-anim" : "work-card";
    const label = title || (isWebm ? prettyName(url) : sourceLabel(parsed.type));

    if (isWebm) {
      card.innerHTML = `<div class="work-media"></div>`;
    } else {
      card.innerHTML = `
      <div class="work-media"></div>
      <div class="work-meta">
        <span class="idx">${pad(index + 1)}</span>
        <span class="work-title"></span>
        <a class="link-go" href="${url}" target="_blank" rel="noreferrer">↗</a>
      </div>
    `;
      const titleEl = card.querySelector(".work-title");
      titleEl.textContent = label;
    }

    const media = card.querySelector(".work-media");
    const tagRow = isWebm ? null : makeTags(tags);
    media.style.cursor = "pointer";
    media.addEventListener("click", () => openOverlay({ ...parsed, url }, label));

    if (parsed.type === "webm") {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.preload = "metadata";
      video.setAttribute("aria-label", label);
      const size = () => applyMediaRatio(card, video);
      video.addEventListener("loadedmetadata", size);
      media.append(video);
      bindVideoPlayback(video);
    } else if (parsed.type === "youtube") {
      const img = document.createElement("img");
      img.alt = label;
      img.src = youtubeThumb(parsed.id);
      media.append(img);
      if (tagRow) media.append(tagRow);
    } else if (parsed.type === "twitter") {
      const titleEl = card.querySelector(".work-title");
      twitterPreview(parsed.id).then((info) => {
        if (info?.thumb) {
          const img = document.createElement("img");
          img.alt = titleEl?.textContent || label;
          img.src = info.thumb;
          media.append(img);
        }
        if (!title && info?.text && titleEl) {
          titleEl.textContent = info.text.replace(/\s+/g, " ").slice(0, 72);
        }
        if (tagRow) media.append(tagRow);
      }).catch(() => {
        if (tagRow) media.append(tagRow);
      });
    } else if (tagRow) {
      media.append(tagRow);
    }
    return card;
  };

  const setupWorks = async (root) => {
    const kind = root.dataset.works;
    const folder = (root.dataset.worksFolder || "").trim();
    const extra = Array.isArray(WORKS[kind]) ? WORKS[kind] : [];
    const track = root.querySelector("[data-carousel-track]");
    const count = root.querySelector("[data-works-count]");
    const prev = root.querySelector("[data-carousel-prev]");
    const next = root.querySelector("[data-carousel-next]");
    if (!track) return;

    const list = folder ? await loadFolderWorks(folder, extra) : extra;
    count && (count.textContent = pad(list.length));
    track.innerHTML = "";

    if (!list.length) {
      root.classList.add("is-empty");
      track.append(emptyCard(kind, folder));
      return;
    }

    list.forEach((item, i) => track.append(makeCard(item, i)));

    const step = () => Math.max(track.clientWidth * 0.72, 240);
    prev?.addEventListener("click", () => {
      track.scrollBy({ left: -step(), behavior: "smooth" });
    });
    next?.addEventListener("click", () => {
      track.scrollBy({ left: step(), behavior: "smooth" });
    });
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") next?.click();
      if (e.key === "ArrowLeft") prev?.click();
    });

    root.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll("[data-view]").forEach((b) => b.classList.remove("is-on"));
        btn.classList.add("is-on");
        root.classList.toggle("is-grid", btn.dataset.view === "grid");
      });
    });
  };

  document.querySelectorAll("[data-works]").forEach(setupWorks);

  const navLinks = [...document.querySelectorAll(".side-nav a[href^='#']")];
  const sections = navLinks
    .map((a) => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);

  const setActive = (id) => {
    navLinks.forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`);
    });
  };

  if (sections.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] }
    );
    sections.forEach((s) => io.observe(s));
    window.addEventListener("scroll", () => {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
      if (nearBottom) setActive("order");
    }, { passive: true });
  }

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  overlay?.querySelector("[data-overlay-close]")?.addEventListener("click", closeOverlay);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
  });
})();
