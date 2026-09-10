(() => {
  const WORKS = window.WORKS || { covers: [], video: [], animations: [] };
  const WEBM = /\.webm($|\?)/i;
  const overlay = document.getElementById("work-overlay");
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
    const [fromJson, fromDir, fromGh] = await Promise.all([
      listFromJson(folder),
      listFromDirectory(folder),
      withTimeout(listFromGitHub(folder), 8000),
    ]);
    const listed = [
      ...fromJson,
      ...fromDir,
      ...fromGh,
      ...collectWebmNames(extra),
    ];
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

  const twitterPreview = async (id) => {
    try {
      const res = await fetch(`https://api.fxtwitter.com/status/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const tweet = data.tweet || {};
      const photos = tweet.media?.photos || [];
      const videos = tweet.media?.videos || [];
      return {
        text: tweet.text || "",
        author: tweet.author?.screen_name || "",
        thumb:
          photos[0]?.url ||
          videos[0]?.thumbnail_url ||
          videos[0]?.url ||
          null,
      };
    } catch {
      return null;
    }
  };

  const sourceLabel = (type) => {
    if (type === "youtube") return "YOUTUBE";
    if (type === "twitter") return "X / TWITTER";
    return "LINK";
  };

  const openOverlay = (parsed, title) => {
    if (!overlay || !overlayBody) return;
    overlayBody.innerHTML = "";
    overlayLabel.textContent = title || sourceLabel(parsed.type);
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
      const frame = document.createElement("iframe");
      frame.src = `https://platform.twitter.com/embed/Tweet.html?id=${parsed.id}&theme=dark&dnt=true`;
      overlayBody.append(frame);
    } else if (parsed.type === "webm") {
      const video = document.createElement("video");
      video.src = parsed.url;
      video.controls = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      overlayBody.append(video);
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
    card.className = "work-card";
    card.innerHTML = `
      <div class="work-media"></div>
      <div class="work-meta">
        <span class="idx">${pad(index + 1)}</span>
        <span class="work-title"></span>
        <a class="link-go" href="${url}" target="_blank" rel="noreferrer">↗</a>
      </div>
    `;
    const media = card.querySelector(".work-media");
    const titleEl = card.querySelector(".work-title");
    titleEl.textContent = title || (isWebm ? prettyName(url) : sourceLabel(parsed.type));

    const tagRow = makeTags(tags);
    media.style.cursor = "pointer";
    media.addEventListener("click", () => openOverlay({ ...parsed, url }, titleEl.textContent));

    if (parsed.type === "webm") {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.preload = "metadata";
      video.setAttribute("aria-label", titleEl.textContent);
      media.append(video);
      if (tagRow) media.append(tagRow);
      bindVideoPlayback(video);
    } else if (parsed.type === "youtube") {
      const img = document.createElement("img");
      img.alt = titleEl.textContent;
      img.src = youtubeThumb(parsed.id);
      media.append(img);
      if (tagRow) media.append(tagRow);
    } else if (parsed.type === "twitter") {
      twitterPreview(parsed.id).then((info) => {
        if (info?.thumb) {
          const img = document.createElement("img");
          img.alt = titleEl.textContent;
          img.src = info.thumb;
          media.append(img);
        }
        if (!title && info?.text) {
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
