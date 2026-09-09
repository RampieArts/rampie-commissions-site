(() => {
  const WORKS = window.WORKS || { covers: [], video: [] };
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

  const normalize = (item) => {
    if (typeof item === "string") return { url: item, title: "", tags: [] };
    const raw = item.tags ?? item.tag ?? [];
    const tags = (Array.isArray(raw) ? raw : [raw])
      .map((tag) => String(tag).trim())
      .filter(Boolean);
    return { url: item.url || "", title: item.title || "", tags };
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

  const emptyCard = (kind) => {
    const card = document.createElement("div");
    card.className = "work-empty";
    card.innerHTML = `No ${kind} yet. Add YouTube or X links in <code>data/works.js</code>.`;
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

  const makeCard = (item, index) => {
    const { url, title, tags } = normalize(item);
    const parsed = parseUrl(url);
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
    titleEl.textContent = title || sourceLabel(parsed.type);

    const tagRow = makeTags(tags);
    media.style.cursor = "pointer";
    media.addEventListener("click", () => openOverlay({ ...parsed, url }, titleEl.textContent));

    if (parsed.type === "youtube") {
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

  const setupWorks = (root) => {
    const kind = root.dataset.works;
    const list = Array.isArray(WORKS[kind]) ? WORKS[kind] : [];
    const track = root.querySelector("[data-carousel-track]");
    const count = root.querySelector("[data-works-count]");
    const prev = root.querySelector("[data-carousel-prev]");
    const next = root.querySelector("[data-carousel-next]");
    if (!track) return;

    count && (count.textContent = pad(list.length));
    track.innerHTML = "";

    if (!list.length) {
      root.classList.add("is-empty");
      track.append(emptyCard(kind));
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
