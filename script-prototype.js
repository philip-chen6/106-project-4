const files = {
  yearly: "data/processed/yearly.csv",
  eraSummary: "data/processed/era_summary.csv",
  songs: "data/processed/songs.csv",
  artistAverages: "data/processed/artist_averages.csv",
  radarNorms: "data/processed/radar_norms.json",
  spotifyLookup: "data/processed/spotify_tracks_lookup.csv",
};

const RADAR_LINE_COLORS = {
  artist: "#8B5E3C",
  song: "#F0C929",
};

const colors = {
  accent: "#d84f2a",
  blue: "#2364aa",
  green: "#2f7d56",
  gold: "#b57912",
  muted: "#6d675f",
  ink: "#191714",
  eras: {
    "Pre-streaming": "#b3b3b3",
    "Streaming growth": "#1db954",
    "Streaming native": "#212121",
  },
};

const eraOrder = ["Pre-streaming", "Streaming growth", "Streaming native"];

const ERA_YEAR_LABELS = {
  "Pre-streaming": "before 2010",
  "Streaming growth": "2010–2019",
  "Streaming native": "2020 onward",
};

const featureMeta = {
  duration_min: {
    label: "Duration",
    axisLabel: "Duration (min)",
    tickFormat: (d) => d.toFixed(2),
    format: (d) => `${d.toFixed(2)} min`,
    caption:
      "Streaming-native hits are shorter on average — a pattern consistent with songs that need to hook listeners before they skip.",
  },
  danceability: {
    label: "Danceability",
    axisLabel: "Danceability (0–1)",
    tickFormat: (d) => d.toFixed(2),
    format: (d) => d.toFixed(3),
    caption:
      "Danceability climbs in the streaming era. Hits became more rhythm-forward as playlists and shuffle listening grew.",
  },
  energy: {
    label: "Energy",
    axisLabel: "Energy (0–1)",
    tickFormat: (d) => d.toFixed(2),
    format: (d) => d.toFixed(3),
    caption:
      "Energy peaked during streaming growth (2010–2019), then dipped slightly in the native era — but stays above pre-streaming levels.",
  },
  loudness: {
    label: "Loudness",
    axisLabel: "Loudness (dB)",
    tickFormat: (d) => d.toFixed(1),
    format: (d) => `${d.toFixed(1)} dB`,
    caption:
      "Modern hits are louder. Chart-toppers got punchier as listening shifted through phones, earbuds, and playlists.",
  },
  acousticness: {
    label: "Acousticness",
    axisLabel: "Acousticness (0–1)",
    tickFormat: (d) => d.toFixed(2),
    format: (d) => d.toFixed(3),
    caption:
      "Acousticness dropped sharply during streaming growth. Fully produced, electronic-leaning tracks dominate recent charts.",
  },
  valence: {
    label: "Valence",
    axisLabel: "Valence (0–1)",
    tickFormat: (d) => d.toFixed(2),
    format: (d) => d.toFixed(3),
    caption:
      "Valence — a measure of musical positivity — fell in the streaming era. Chart hits skew moodier than they used to.",
  },
};

const RADAR_FEATURES = [
  "duration_min",
  "danceability",
  "energy",
  "loudness",
  "acousticness",
  "valence",
].map((key) => ({ key, label: featureMeta[key].label }));

const tooltip = d3.select("#tooltip");

let eraSummaryData = [];
let yearlyData = [];
let songsData = [];
let artistAveragesData = [];
let radarNorms = null;
let spotifyLookupData = null;
let spotifyLookupPromise = null;
let tracksByArtistKey = null;
let lastRadarQuery = null;
let radarComparisonState = null;
let activeEraFeature = "duration_min";
let profileEra = "Streaming native";
let scrollLocked = false;
let scrollLockTimer = null;
let activeSongIndex = 0;

const curatedSongs = [
  {
    song: "I Love You",
    performer: "Billie Eilish",
    year: 2019,
    duration_min: 4.863266666666667,
    energy: 0.131,
    danceability: 0.421,
    acousticness: 0.952,
    best_rank: 53,
    why:
      "A quiet, slow Billie Eilish ballad still charted in an era where the average hit was getting shorter and more rhythm-forward.",
  },
  {
    song: "Video Games",
    performer: "Lana Del Rey",
    year: 2012,
    duration_min: 4.699333333333334,
    energy: 0.249,
    danceability: 0.236,
    acousticness: 0.811,
    best_rank: 91,
    why:
      "This song is cinematic, slow, and low-energy, which makes it a useful counterexample to the idea that every modern hit chases instant motion.",
  },
  {
    song: "Fear.",
    performer: "Kendrick Lamar",
    year: 2017,
    duration_min: 7.676216666666667,
    energy: 0.479,
    danceability: 0.588,
    acousticness: 0.604,
    best_rank: 50,
    why:
      "At over seven minutes, Kendrick Lamar's track breaks the short-song pattern while still reaching the Hot 100.",
  },
  {
    song: "Marvins Room",
    performer: "Drake",
    year: 2011,
    duration_min: 5.7871,
    energy: 0.26,
    danceability: 0.492,
    acousticness: 0.646,
    best_rank: 21,
    why:
      "Drake's moody, spacious track shows that emotional atmosphere can still compete with the punchier profile of streaming-era hits.",
  },
  {
    song: "Last Kiss",
    performer: "Taylor Swift",
    year: 2010,
    duration_min: 6.118883333333334,
    energy: 0.341,
    danceability: 0.371,
    acousticness: 0.57,
    best_rank: 71,
    why:
      "A six-minute Taylor Swift ballad sits right at the streaming-growth boundary, showing what the average trend started moving away from.",
  },
  {
    song: "close",
    performer: "J. Cole",
    year: 2021,
    duration_min: 6.827333333333334,
    energy: 0.185,
    danceability: 0.613,
    acousticness: 0.853,
    best_rank: 33,
    why:
      "A long, quiet 2021 chart entry helps separate the overall streaming-native pattern from the individual songs that bend it.",
  },
];

function parseRow(row) {
  const parsed = { ...row };
  for (const key of Object.keys(parsed)) {
    const value = parsed[key];
    if (value !== "" && !Number.isNaN(+value)) parsed[key] = +value;
  }
  return parsed;
}

function chartFrame(selector, margin = { top: 16, right: 22, bottom: 42, left: 52 }) {
  const node = document.querySelector(selector);
  if (!node) return null;
  node.innerHTML = "";
  const width = node.clientWidth;
  const height = node.clientHeight || 320;
  const svg = d3
    .select(node)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height);

  return {
    svg,
    width,
    height,
    margin,
    innerWidth: width - margin.left - margin.right,
    innerHeight: height - margin.top - margin.bottom,
    g: svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`),
  };
}

function addGrid(g, x, y, innerWidth, innerHeight) {
  g.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(""))
    .call((axis) => axis.select(".domain").remove());
}

function showTip(event, html) {
  tooltip
    .style("opacity", 1)
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`)
    .html(html);
}

function hideTip() {
  tooltip.style("opacity", 0);
}

function computeYAxisLayout(yScale, meta) {
  const tickLabels = yScale.ticks(4).map((t) => meta.tickFormat(t));
  const tickWidth = d3.max(tickLabels, (d) => String(d).length) * 7.5 + 12;
  const labelColumn = 22;
  const leftMargin = tickWidth + labelColumn + 8;
  const labelOffset = tickWidth + labelColumn / 2;
  return {
    top: 22,
    right: 18,
    bottom: 38,
    left: leftMargin,
    labelOffset,
  };
}

function addVerticalYAxisLabel(svg, margin, innerHeight, label, labelOffset) {
  const x = margin.left - labelOffset;
  const y = margin.top + innerHeight / 2;
  svg
    .append("text")
    .attr("class", "annotation axis-label-y")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("transform", `translate(${x}, ${y}) rotate(-90)`)
    .text(label);
}

const NATIVE_ERA_START = 2020;
const GROWTH_ERA_START = 2010;

function getEraRegions(minYear, dataMaxYear) {
  return [
    { era: "Pre-streaming", start: minYear, end: GROWTH_ERA_START },
    { era: "Streaming growth", start: GROWTH_ERA_START, end: NATIVE_ERA_START },
    { era: "Streaming native", start: NATIVE_ERA_START, end: dataMaxYear },
  ];
}

function eraComparisonChart(data, featureKey, options = {}) {
  const chartSelector = options.chartSelector || "#era-comparison";
  const captionSelector = options.captionSelector || "#era-caption";
  const pillsSelector = options.pillsSelector || ".feature-pill";
  const meta = featureMeta[featureKey];
  const values = data.map((d) => d[featureKey]);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const padding = (yMax - yMin) * 0.25 || 0.1;
  const yScale = d3
    .scaleLinear()
    .domain([Math.min(yMin - padding, yMin), yMax + padding])
    .nice();
  const layout = computeYAxisLayout(yScale, meta);

  const frame = chartFrame(chartSelector, {
    top: layout.top,
    right: layout.right,
    bottom: layout.bottom,
    left: layout.left,
  });
  if (!frame) return;

  const { svg, g, innerWidth, innerHeight, margin } = frame;
  const x = d3.scaleBand().domain(eraOrder).range([0, innerWidth]).padding(0.32);
  const y = yScale.range([innerHeight, 0]);

  addGrid(g, x, y, innerWidth, innerHeight);

  g.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(d.era))
    .attr("y", (d) => y(d[featureKey]))
    .attr("width", x.bandwidth())
    .attr("height", (d) => innerHeight - y(d[featureKey]))
    .attr("fill", (d) => colors.eras[d.era])
    .attr("rx", 3)
    .attr("opacity", 0.88)
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("opacity", 1);
      showTip(
        event,
        `<strong>${d.era}</strong><br>${meta.label}: ${meta.format(d[featureKey])}<br>${d.songs.toLocaleString()} songs`
      );
    })
    .on("mouseleave", function () {
      d3.select(this).attr("opacity", 0.88);
      hideTip();
    });

  g.selectAll(".bar-label")
    .data(data)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", (d) => x(d.era) + x.bandwidth() / 2)
    .attr("y", (d) => y(d[featureKey]) - 8)
    .attr("text-anchor", "middle")
    .attr("fill", colors.ink)
    .attr("font-size", "12px")
    .attr("font-weight", "600")
    .text((d) => meta.format(d[featureKey]));

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("font-size", "11px");

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(4).tickFormat(meta.tickFormat))
    .call((axis) => axis.selectAll("text").attr("dx", "-6px"));

  addVerticalYAxisLabel(svg, margin, innerHeight, meta.axisLabel, layout.labelOffset);

  const caption = document.querySelector(captionSelector);
  if (caption) caption.textContent = meta.caption;
  syncFeaturePills(featureKey, pillsSelector);
}

function featureSparkline(yearly, eraSummary, featureKey, options = {}) {
  const chartSelector = options.chartSelector || "#feature-sparkline";
  const meta = featureMeta[featureKey];
  if (!yearly.length || !eraSummary.length) return;

  const [minYear, maxYear] = d3.extent(yearly, (d) => d.year);
  const regions = getEraRegions(minYear, maxYear);
  const yExtent = d3.extent(yearly, (d) => d[featureKey]);
  const yPadding = (yExtent[1] - yExtent[0]) * 0.12 || 0.05;
  const yScale = d3
    .scaleLinear()
    .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
    .nice();
  const layout = computeYAxisLayout(yScale, meta);

  const frame = chartFrame(chartSelector, {
    top: layout.top,
    right: layout.right,
    bottom: layout.bottom,
    left: layout.left,
  });
  if (!frame) return;

  const { svg, g, innerWidth, innerHeight, margin } = frame;
  const x = d3.scaleLinear().domain([minYear, maxYear]).range([0, innerWidth]);
  const y = yScale.range([innerHeight, 0]);

  const shade = g.append("g").attr("class", "era-shades");
  shade
    .selectAll("rect")
    .data(regions)
    .join("rect")
    .attr("x", (d) => x(d.start))
    .attr("width", (d) => Math.max(0, x(d.end) - x(d.start)))
    .attr("y", 0)
    .attr("height", innerHeight)
    .attr("fill", (d) => colors.eras[d.era])
    .attr("opacity", 0.14)
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("opacity", 0.22);
      const summary = eraSummary.find((row) => row.era === d.era);
      if (!summary) return;
      showTip(
        event,
        `<strong>${d.era}</strong><br>Avg ${meta.label}: ${meta.format(summary[featureKey])}<br>${summary.songs.toLocaleString()} songs`
      );
    })
    .on("mouseleave", function () {
      d3.select(this).attr("opacity", 0.14);
      hideTip();
    });

  addGrid(g, x, y, innerWidth, innerHeight);

  g.append("path")
    .datum(yearly)
    .attr("fill", "none")
    .attr("stroke", colors.ink)
    .attr("stroke-width", 2.2)
    .attr("opacity", 0.85)
    .attr(
      "d",
      d3
        .line()
        .x((d) => x(d.year))
        .y((d) => y(d[featureKey]))
        .curve(d3.curveMonotoneX)
    );

  g.selectAll(".year-dot")
    .data(yearly)
    .join("circle")
    .attr("class", "year-dot")
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d[featureKey]))
    .attr("r", 2.5)
    .attr("fill", colors.ink)
    .attr("opacity", 0)
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("opacity", 1).attr("r", 4);
      showTip(event, `<strong>${d.year}</strong><br>${meta.label}: ${meta.format(d[featureKey])}`);
    })
    .on("mouseleave", function () {
      d3.select(this).attr("opacity", 0).attr("r", 2.5);
      hideTip();
    });

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(
      d3
        .axisBottom(x)
        .ticks(8)
        .tickFormat(d3.format("d"))
        .tickValues(
          d3.range(Math.ceil(minYear / 10) * 10, maxYear + 1, 10).filter(
            (year) => year >= minYear && year <= maxYear
          )
        )
    )
    .call((axis) => axis.selectAll("text").attr("dy", "6px"));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(4).tickFormat(meta.tickFormat))
    .call((axis) => axis.selectAll("text").attr("dx", "-6px"));

  addVerticalYAxisLabel(svg, margin, innerHeight, meta.axisLabel, layout.labelOffset);
}

function toSpotifySearchUrl(song, performer) {
  const query = encodeURIComponent(`${song} ${performer}`);
  return `https://open.spotify.com/search/${query}`;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSongCarousel() {
  const container = d3.select("#song-card");
  const dots = d3.select("#song-dots");
  if (container.empty()) return;

  const song = curatedSongs[activeSongIndex];
  const eraName = eraForYear(song.year);
  const eraRow = eraSummaryData.find((d) => d?.era === eraName);
  const eraSongs = songsData.filter((d) => d.era === eraName);
  const barFeatures = ["duration_min", "energy", "danceability", "acousticness"];
  const barCards = eraRow
    ? barFeatures.map((key) =>
        buildFeatureBarCard({
          song,
          featureKey: key,
          eraName,
          eraRow,
          eraSongs,
          songRowLabel: "This hit",
        })
      )
    : [];

  container.selectAll("*").remove();

  const main = container
    .append("div")
    .attr("class", "song-card-main");
  main.html(`
      <div>
        <h3>${song.song}</h3>
        <p class="song-artist">${song.performer} · ${song.year}</p>
      </div>
      <a class="native-play" href="${toSpotifySearchUrl(song.song, song.performer)}" target="_blank" rel="noopener noreferrer">
        Play on Spotify
      </a>
    `);

  container.append("p").attr("class", "song-why").text(song.why);

  const grid = container.append("div").attr("class", "song-feature-bars");

  const barSel = grid
    .selectAll(".song-bar-card")
    .data(barCards, (d) => d.key)
    .join("article")
    .attr("class", "song-bar-card");

  barSel.append("h4").text((d) => d.label);
  barSel.append("div").attr("class", "native-bar-chart").call(renderMiniPairBars);
  barSel
    .append("p")
    .attr("class", "song-metric-vs")
    .text((d) => `Δ ${d.deltaLabel} vs ${eraName.toLowerCase()} mean (${d.baselineLabel})`);

  grid
    .append("div")
    .attr("class", "song-metric-peak")
    .html(
      `<dt>Peak</dt><dd>#${Math.round(song.best_rank)}</dd>`
    );

  if (!dots.empty()) {
    dots
      .selectAll("button")
      .data(curatedSongs)
      .join("button")
      .attr("type", "button")
      .attr("aria-label", (d, i) => `Show ${d.song} by ${d.performer}`)
      .attr("aria-current", (d, i) => (i === activeSongIndex ? "true" : "false"))
      .on("click", (event, d) => {
        activeSongIndex = curatedSongs.indexOf(d);
        renderSongCarousel();
      });
  }
}

function setupSongCarousel() {
  const prev = document.querySelector("#prev-song");
  const next = document.querySelector("#next-song");
  if (!prev || !next) return;

  prev.addEventListener("click", () => {
    activeSongIndex = (activeSongIndex - 1 + curatedSongs.length) % curatedSongs.length;
    renderSongCarousel();
  });
  next.addEventListener("click", () => {
    activeSongIndex = (activeSongIndex + 1) % curatedSongs.length;
    renderSongCarousel();
  });
  renderSongCarousel();
}

function getSongLabel(song) {
  return `${song.Song} ${song.Performer}`.toLowerCase();
}

function normalizeArtistKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function splitArtistNames(value) {
  return String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

function ensureTrackIndex() {
  if (tracksByArtistKey || !spotifyLookupData?.length) return;
  tracksByArtistKey = new Map();
  spotifyLookupData.forEach((row) => {
    const track = String(row.track_name || "").trim();
    if (!track) return;
    splitArtistNames(row.artists).forEach((artistName) => {
      const key = normalizeArtistKey(artistName);
      if (!tracksByArtistKey.has(key)) tracksByArtistKey.set(key, new Set());
      tracksByArtistKey.get(key).add(track);
    });
  });
}

function filterArtistSuggestions(query, limit = 8) {
  const normalized = normalizeArtistKey(query);
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const scored = [];

  artistAveragesData.forEach((row) => {
    const key = normalizeArtistKey(row.artist_key || row.artist);
    const name = String(row.artist || "").trim();
    if (!name) return;

    let score = 0;
    if (key === normalized || name.toLowerCase() === normalized) score += 200;
    if (key.startsWith(normalized) || name.toLowerCase().startsWith(normalized)) score += 120;
    if (key.includes(normalized) || name.toLowerCase().includes(normalized)) score += 70;
    tokens.forEach((token) => {
      if (key.includes(token)) score += 24;
    });
    score += Math.min(+row.tracks || 0, 200) / 50;

    if (score > 30) scored.push({ name, score });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => entry.name);
}

function filterSongSuggestions(artistQuery, songQuery, limit = 8) {
  const artist = normalizeArtistKey(artistQuery);
  if (!artist || !tracksByArtistKey) return [];

  const tokens = artist.split(/\s+/).filter(Boolean);
  const titles = new Set();

  tracksByArtistKey.forEach((trackSet, key) => {
    if (!tokens.every((token) => key.includes(token))) return;
    trackSet.forEach((title) => titles.add(title));
  });

  const query = songQuery.trim().toLowerCase();
  const scored = [];

  titles.forEach((title) => {
    const lower = title.toLowerCase();
    let score = 1;
    if (query) {
      if (lower === query) score += 200;
      else if (lower.startsWith(query)) score += 120;
      else if (lower.includes(query)) score += 60;
      else return;
    }
    scored.push({ title, score });
  });

  return scored
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((entry) => entry.title);
}

function attachAutocomplete(input, list, getSuggestions) {
  if (!input || !list) return;

  let activeIndex = -1;
  let currentSuggestions = [];

  const hideList = () => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    list.querySelectorAll("li").forEach((item) => item.removeAttribute("aria-selected"));
  };

  const renderSuggestions = (items) => {
    currentSuggestions = items;
    activeIndex = -1;
    list.innerHTML = "";

    if (!items.length) {
      hideList();
      return;
    }

    items.forEach((label, index) => {
      const item = document.createElement("li");
      item.setAttribute("role", "option");
      item.setAttribute("id", `${list.id}-option-${index}`);
      item.textContent = label;
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        input.value = label;
        hideList();
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      list.appendChild(item);
    });

    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const refresh = debounce(async () => {
    const items = await getSuggestions(input.value);
    renderSuggestions(items);
  }, 120);

  const moveActive = (delta) => {
    if (!currentSuggestions.length || list.hidden) return;
    activeIndex = (activeIndex + delta + currentSuggestions.length) % currentSuggestions.length;
    list.querySelectorAll("li").forEach((item, index) => {
      const selected = index === activeIndex;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected) item.scrollIntoView({ block: "nearest" });
    });
  };

  input.addEventListener("input", refresh);
  input.addEventListener("focus", refresh);
  input.addEventListener("blur", () => {
    window.setTimeout(hideList, 140);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      input.value = currentSuggestions[activeIndex];
      hideList();
    } else if (event.key === "Escape") {
      hideList();
    }
  });

  const field = input.closest(".combo-field");
  document.addEventListener("click", (event) => {
    if (field && !field.contains(event.target)) hideList();
  });
}

function normalizeRadarFeature(key, value, norms) {
  if (!Number.isFinite(value) || !norms?.[key]) return null;
  const spec = norms[key];
  if (spec.scaled) return Math.max(0, Math.min(1, value));
  const span = spec.max - spec.min;
  if (!Number.isFinite(span) || span === 0) return 0.5;
  return Math.max(0, Math.min(1, (value - spec.min) / span));
}

function radarValuesFromRow(row) {
  const values = {};
  RADAR_FEATURES.forEach(({ key }) => {
    values[key] = normalizeRadarFeature(key, +row[key], radarNorms);
  });
  return values;
}

function findArtistAverage(artistQuery) {
  const query = normalizeArtistKey(artistQuery);
  if (!query) return null;

  let best = null;
  let bestScore = -Infinity;
  const tokens = query.split(/\s+/).filter(Boolean);

  artistAveragesData.forEach((row) => {
    const key = normalizeArtistKey(row.artist_key || row.artist);
    let score = 0;
    if (key === query) score += 160;
    if (key.includes(query) || query.includes(key)) score += 90;
    tokens.forEach((token) => {
      if (key.includes(token)) score += 18;
    });
    score += Math.min(+row.tracks || 0, 120) / 40;

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  });

  return bestScore > 20 ? best : null;
}

function findBillboardSong(artistQuery, songTitle = "") {
  const artist = normalizeArtistKey(artistQuery);
  const title = songTitle.trim().toLowerCase();
  if (!artist) return null;

  let best = null;
  let bestScore = -Infinity;

  songsData.forEach((song) => {
    const performer = normalizeArtistKey(song.Performer);
    const track = String(song.Song || "").toLowerCase();
    if (!performer.includes(artist) && !artist.split(/\s+/).every((token) => performer.includes(token))) {
      return;
    }

    let score = 40;
    if (title) {
      if (track === title) score += 140;
      else if (track.includes(title)) score += 80;
      else return;
    }
    if (Number.isFinite(song.best_rank)) score += (101 - song.best_rank) / 20;

    if (score > bestScore) {
      best = song;
      bestScore = score;
    }
  });

  return best;
}

function findSpotifyTrack(artistQuery, songTitle, lookup) {
  const artist = normalizeArtistKey(artistQuery);
  const title = songTitle.trim().toLowerCase();
  if (!artist || !lookup?.length) return null;

  let best = null;
  let bestScore = -Infinity;
  const tokens = artist.split(/\s+/).filter(Boolean);

  lookup.forEach((row) => {
    const artists = normalizeArtistKey(row.artists);
    if (!tokens.every((token) => artists.includes(token))) return;

    const track = String(row.track_name || "").toLowerCase();
    let score = 30;
    if (title) {
      if (track === title) score += 140;
      else if (track.includes(title)) score += 75;
      else return;
    }

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  });

  return best;
}

function eraFromYear(year) {
  const y = +year;
  if (!Number.isFinite(y)) return null;
  if (y < 2010) return "Pre-streaming";
  if (y < 2020) return "Streaming growth";
  return "Streaming native";
}

function songReleaseYear(spotifyTrack, billboardSong) {
  const year = +(spotifyTrack?.release_year ?? spotifyTrack?.year ?? billboardSong?.year);
  return Number.isFinite(year) ? year : null;
}

function buildSongFeatureRow(billboardSong, spotifyTrack) {
  const row = {};
  RADAR_FEATURES.forEach(({ key }) => {
    const billboardValue = billboardSong ? +billboardSong[key] : NaN;
    let spotifyValue = spotifyTrack ? +spotifyTrack[key] : NaN;
    if (!Number.isFinite(spotifyValue) && spotifyTrack?.duration_ms) {
      spotifyValue = +spotifyTrack.duration_ms / 60000;
    }
    row[key] = Number.isFinite(spotifyValue) ? spotifyValue : billboardValue;
  });
  return row;
}

function loadSpotifyLookup() {
  if (spotifyLookupData) return Promise.resolve(spotifyLookupData);
  if (!spotifyLookupPromise) {
    spotifyLookupPromise = d3.csv(files.spotifyLookup, parseRow).then((rows) => {
      spotifyLookupData = rows;
      return rows;
    });
  }
  return spotifyLookupPromise;
}

function formatRadarRawValue(key, raw) {
  const value = raw?.[key];
  if (!Number.isFinite(+value)) return "—";
  return featureMeta[key] ? featureMeta[key].format(value) : String(value);
}

function radarSeriesTooltip(entry) {
  const rows = RADAR_FEATURES.map(({ key, label }) => `${label}: ${formatRadarRawValue(key, entry.raw)}`);
  return `<strong>${escapeHTML(entry.label)}</strong><br>${rows.join("<br>")}`;
}

function appendEraSeries(series, visibleEra = "all") {
  eraOrder.forEach((era) => {
    const eraRow = eraSummaryData.find((d) => d?.era === era);
    if (!eraRow) return;

    const visible =
      visibleEra === "all" ? true : visibleEra === "none" ? false : era === visibleEra;

    series.push({
      id: `era-${era}`,
      label: era,
      color: colors.eras[era],
      raw: eraRow,
      values: radarValuesFromRow(eraRow),
      visible,
    });
  });
}

function buildEraRadarSeries() {
  const series = [];
  appendEraSeries(series, "all");
  return series;
}

function showEraRadarComparison() {
  if (!radarNorms) return;
  const series = buildEraRadarSeries();
  if (series.length) showRadarComparison(series);
}

function buildRadarSeries(artistInput, titleInput, billboardSong, spotifyTrack, artistRow) {
  const series = [];
  const songFeatureRow = buildSongFeatureRow(billboardSong, spotifyTrack);
  const hasSongFeatures = RADAR_FEATURES.some(({ key }) => Number.isFinite(+songFeatureRow[key]));
  const hasSong = Boolean(titleInput) && hasSongFeatures;

  if (hasSong) {
    const releaseYear = songReleaseYear(spotifyTrack, billboardSong);
    const songEra = eraFromYear(releaseYear);
    appendEraSeries(series, songEra || "none");

    if (artistRow) {
      series.push({
        id: "artist",
        label: `${artistRow.artist}'s Catalog`,
        color: RADAR_LINE_COLORS.artist,
        raw: artistRow,
        values: radarValuesFromRow(artistRow),
        visible: true,
      });
    }

    const songLabel = spotifyTrack?.track_name || billboardSong?.Song || titleInput;
    series.push({
      id: "song",
      label: songLabel,
      color: RADAR_LINE_COLORS.song,
      raw: { ...songFeatureRow, release_year: releaseYear, era: songEra },
      values: radarValuesFromRow(songFeatureRow),
      visible: true,
    });
  } else if (artistRow) {
    appendEraSeries(series, "none");
    series.push({
      id: "artist",
      label: `${artistRow.artist}'s Catalog`,
      color: RADAR_LINE_COLORS.artist,
      raw: artistRow,
      values: radarValuesFromRow(artistRow),
      visible: true,
    });
  }

  return series;
}

function renderRadarLegendControls(series) {
  const host = d3.select("#song-radar-legend");
  if (host.empty()) return;

  const toggles = host
    .selectAll("button.radar-toggle")
    .data(series, (d) => d.id)
    .join("button")
    .attr("type", "button")
    .attr("class", (d) => {
      const eraClass = d.id.startsWith("era-") ? " radar-toggle-era" : "";
      return `radar-toggle${eraClass}${d.visible ? " active" : ""}`;
    })
    .attr("data-era", (d) => (d.id.startsWith("era-") ? d.label : null))
    .attr("aria-pressed", (d) => d.visible)
    .style("--toggle-color", (d) => d.color);

  toggles.selectAll("*").remove();

  toggles.each(function (d) {
    const btn = d3.select(this);

    if (d.id.startsWith("era-")) {
      btn.append("span").attr("class", "radar-toggle-label").text(d.label);
      btn.append("span").attr("class", "radar-toggle-years").text(ERA_YEAR_LABELS[d.label] || "");
      return;
    }

    btn.append("span").attr("class", "radar-toggle-swatch").attr("aria-hidden", "true");
    btn.append("span").attr("class", "radar-toggle-label").text(d.label);
  });

  toggles.on("click", (event, d) => {
    d.visible = !d.visible;
    if (radarComparisonState) {
      radarComparisonState.series = series;
    }
    renderRadarLegendControls(series);
    renderRadarChart(series);
  });
}

function renderRadarAxisTicks(chartGroup, levelScale, levels) {
  const ticks = chartGroup.append("g").attr("class", "radar-ticks");
  const formatTick = d3.format(".1f");

  for (let tick = 1; tick <= levels; tick += 1) {
    const tickValue = tick / levels;
    const tickGroup = ticks
      .append("g")
      .attr("class", "radar-tick-group")
      .attr("transform", `translate(0,${-levelScale(tickValue)})`);

    tickGroup
      .append("text")
      .attr("class", "radar-tick")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(formatTick(tickValue));

    tickGroup.each(function () {
      const group = d3.select(this);
      const textNode = group.select("text").node();
      if (!textNode) return;
      const bbox = textNode.getBBox();
      const padX = 5;
      const padY = 3;
      group
        .insert("rect", "text")
        .attr("class", "radar-tick-bg")
        .attr("x", bbox.x - padX)
        .attr("y", bbox.y - padY)
        .attr("width", bbox.width + padX * 2)
        .attr("height", bbox.height + padY * 2)
        .attr("rx", 3);
    });
  }
}

function renderRadarChart(series) {
  const host = d3.select("#song-radar-chart");
  if (host.empty()) return;

  host.selectAll("*").remove();

  if (!series.length) {
    host.append("p").attr("class", "radar-empty").text("Era comparison will appear when chart data loads.");
    return;
  }

  const visible = series.filter((d) => d.visible);
  if (!visible.length) {
    host.append("p").attr("class", "radar-empty").text("Turn on at least one line in the legend above.");
    return;
  }

  const width = Math.min(520, host.node().clientWidth || 520);
  const height = width;
  const labelOffset = 38;
  const margin = 72;
  const radius = width / 2 - margin;
  const center = width / 2;
  const levels = 10;
  const angleStep = (Math.PI * 2) / RADAR_FEATURES.length;

  const svg = host
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Interactive radar chart comparing normalized audio features");

  const g = svg.append("g").attr("transform", `translate(${center},${center})`);

  const levelScale = d3.scaleLinear().domain([0, 1]).range([0, radius]);
  const grid = g.append("g").attr("class", "radar-grid");

  for (let level = 1; level <= levels; level += 1) {
    const levelRadius = (radius / levels) * level;
    grid.append("circle").attr("r", levelRadius).attr("fill", "none");
  }

  const axis = g.append("g").attr("class", "radar-axes");
  RADAR_FEATURES.forEach((feature, index) => {
    const angle = angleStep * index - Math.PI / 2;
    axis
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", Math.cos(angle) * radius)
      .attr("y2", Math.sin(angle) * radius);
  });

  renderRadarAxisTicks(g, levelScale, levels);

  const radarAngle = (index) => index * angleStep - Math.PI / 2;
  // d3.lineRadial uses (sin θ, −cos θ); axis labels use (cos θ, sin θ) with the same θ.
  const radarLineAngle = (index) => radarAngle(index) + Math.PI / 2;

  const line = d3
    .lineRadial()
    .radius((d) => levelScale(d.value))
    .angle((d) => radarLineAngle(d.index))
    .curve(d3.curveLinearClosed);

  const plot = g.append("g").attr("class", "radar-series");

  visible.forEach((entry) => {
    const points = RADAR_FEATURES.map(({ key }, index) => ({
      index,
      key,
      value: entry.values[key] ?? 0,
    }));

    const layer = plot.append("g").attr("class", "radar-layer").attr("data-series-id", entry.id);

    layer
      .append("path")
      .datum(points)
      .attr("class", `radar-path radar-path-${entry.id}`)
      .attr("d", line)
      .attr("fill", entry.color)
      .attr("fill-opacity", 0.14)
      .attr("stroke", entry.color)
      .attr("stroke-width", 2.4)
      .attr("stroke-linejoin", "round")
      .style("cursor", "pointer")
      .on("mouseenter", (event) => showTip(event, radarSeriesTooltip(entry)))
      .on("mouseleave", hideTip);

    layer
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("class", `radar-point radar-point-${entry.id}`)
      .attr("r", 3.5)
      .attr("cx", (d) => Math.cos(radarAngle(d.index)) * levelScale(d.value))
      .attr("cy", (d) => Math.sin(radarAngle(d.index)) * levelScale(d.value))
      .attr("fill", entry.color)
      .attr("stroke", colors.ink)
      .attr("stroke-width", 1)
      .style("pointer-events", "none");
  });

  const axisLabels = g.append("g").attr("class", "radar-axis-labels");
  RADAR_FEATURES.forEach((feature, index) => {
    const angle = angleStep * index - Math.PI / 2;
    axisLabels
      .append("text")
      .attr("class", "radar-axis-label")
      .attr("x", Math.cos(angle) * (radius + labelOffset))
      .attr("y", Math.sin(angle) * (radius + labelOffset))
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .text(feature.label);
  });
}

function showRadarComparison(series) {
  radarComparisonState = { series };
  renderRadarLegendControls(series);
  renderRadarChart(series);
}

function clearRadarComparison() {
  radarComparisonState = null;
  d3.select("#song-radar-legend").selectAll("*").remove();
  renderRadarChart([]);
}

async function renderSongComparison(artistQuery, songTitle = "") {
  const container = d3.select("#song-compare-result");
  const artistInput = artistQuery.trim();
  const titleInput = songTitle.trim();

  if (!artistInput) {
    showEraRadarComparison();
    container.html("");
    return;
  }

  if (!radarNorms) {
    container.html(`<p class="compare-empty">Radar normalization data is still loading.</p>`);
    return;
  }

  container.html(`<p class="compare-empty">Building comparison…</p>`);

  const artistRow = findArtistAverage(artistInput);
  const billboardSong = titleInput ? findBillboardSong(artistInput, titleInput) : null;
  let spotifyTrack = null;

  if (titleInput) {
    const lookup = await loadSpotifyLookup();
    spotifyTrack = findSpotifyTrack(artistInput, titleInput, lookup);
  }

  const series = buildRadarSeries(artistInput, titleInput, billboardSong, spotifyTrack, artistRow);

  if (!series.length) {
    showEraRadarComparison();
  container.html(`
      <p class="compare-empty">We could not find “${escapeHTML(artistInput)}” in the Spotify catalog averages. Try another spelling.</p>
    `);
    return;
  }

  showRadarComparison(series);

  const songFeatureRow = buildSongFeatureRow(billboardSong, spotifyTrack);
  const hasSongFeatures = RADAR_FEATURES.some(({ key }) => Number.isFinite(+songFeatureRow[key]));

  if (titleInput && !hasSongFeatures) {
    container.html(
      `<p class="compare-empty">No close track match for “${escapeHTML(titleInput)}”. Try another title or leave song blank to compare eras and artist only.</p>`
    );
    return;
  }

  container.html("");
}

function setupSongCompare() {
  const form = document.querySelector("#song-compare-form");
  const artistInput = document.querySelector("#artist-search");
  const songInput = document.querySelector("#song-title-search");
  const artistList = document.querySelector("#artist-suggestions");
  const songList = document.querySelector("#song-suggestions");
  if (!form || !artistInput) return;

  const submit = () => {
    lastRadarQuery = { artist: artistInput.value, song: songInput?.value || "" };
    renderSongComparison(lastRadarQuery.artist, lastRadarQuery.song);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });

  attachAutocomplete(artistInput, artistList, (query) => filterArtistSuggestions(query));

  if (songInput && songList) {
    attachAutocomplete(songInput, songList, async (query) => {
      if (!normalizeArtistKey(artistInput.value)) return [];
      await loadSpotifyLookup();
      ensureTrackIndex();
      return filterSongSuggestions(artistInput.value, query);
    });

    artistInput.addEventListener("input", () => {
      if (!normalizeArtistKey(artistInput.value)) songInput.value = "";
    });
  }

  d3.select("#song-compare-result").html("");
  showEraRadarComparison();
}

function normalizeFeatureValue(featureKey, value, yearly) {
  const values = yearly.map((d) => d[featureKey]).filter((d) => Number.isFinite(d));
  const min = d3.min(values);
  const max = d3.max(values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function normalizeWithBounds(value, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function formatDelta(featureKey, delta) {
  if (featureKey === "duration_min") return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} min`;
  if (featureKey === "loudness") return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} dB`;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`;
}

function eraForYear(year) {
  if (year < 2010) return "Pre-streaming";
  if (year < 2020) return "Streaming growth";
  return "Streaming native";
}

function exceptionCompareThreshold(featureKey) {
  return {
    duration_min: 0.2,
    danceability: 0.05,
    energy: 0.05,
    acousticness: 0.06,
  }[featureKey];
}

function buildMetricVsMean(song, featureKey) {
  const eraName = eraForYear(song.year);
  const eraRow = eraSummaryData.find((d) => d?.era === eraName);
  if (!eraRow) return "";

  const value = song[featureKey];
  const mean = eraRow[featureKey];
  if (!Number.isFinite(value) || !Number.isFinite(mean)) return "";

  const delta = value - mean;
  const threshold = exceptionCompareThreshold(featureKey);
  if (threshold == null || Math.abs(delta) < threshold) return "";

  return `${formatDelta(featureKey, delta)} vs ${eraName.toLowerCase()} mean (${featureMeta[featureKey].format(mean)})`;
}

function barPct(normalized) {
  if (!Number.isFinite(normalized)) return 0;
  const pct = Math.round(normalized * 100);
  // Prevent “invisible” bars when value is at dataset min.
  return pct === 0 ? 2 : pct;
}

function featureHistogram(values, rangeMin, rangeMax, binCount = 10) {
  const finite = values.filter((d) => Number.isFinite(d));
  if (!finite.length || !Number.isFinite(rangeMin) || !Number.isFinite(rangeMax)) return [];

  if (rangeMin === rangeMax) {
    return [{ x0: rangeMin, x1: rangeMax, length: finite.length }];
  }

  const step = (rangeMax - rangeMin) / binCount;
  const thresholds = Array.from({ length: binCount - 1 }, (_, index) => rangeMin + step * (index + 1));

  return d3.bin().domain([rangeMin, rangeMax]).thresholds(thresholds)(finite);
}

function miniHistBarGeometry(bin, xScale, barGap = 1) {
  const x0 = xScale(bin.x0);
  const x1 = xScale(bin.x1);
  const width = Math.max(x1 - x0 - barGap, 1);
  const x = x0 + barGap / 2;
  return { x, width, center: x + width / 2 };
}

function histXDomainMin(featureKey, rangeMin) {
  if (featureKey === "acousticness") return 0;
  return rangeMin;
}

function needsHistAxisBreak(featureKey, xDomainMin) {
  if (featureKey === "acousticness") return false;
  return Number.isFinite(xDomainMin) && xDomainMin > 0;
}

function appendHistAxisBreak(g, { chartBottom, bucketLabelY, plotLeft, zeroLabel }) {
  g.append("text")
    .attr("class", "mini-hist-bucket-label mini-hist-break-zero")
    .attr("x", 0)
    .attr("y", bucketLabelY)
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "hanging")
    .text(zeroLabel);

  g.append("line")
    .attr("class", "mini-hist-x-tick")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", chartBottom)
    .attr("y2", chartBottom + 3);

  g.append("line")
    .attr("class", "mini-hist-x-axis mini-hist-x-axis-stub")
    .attr("x1", 0)
    .attr("x2", Math.max(plotLeft - 8, 2))
    .attr("y1", chartBottom)
    .attr("y2", chartBottom);

  const slashPairs = [
    [plotLeft - 8, plotLeft - 5],
    [plotLeft - 5, plotLeft - 2],
  ];

  slashPairs.forEach(([x1, x2]) => {
    g.append("line")
      .attr("class", "mini-hist-axis-break")
      .attr("x1", x1)
      .attr("y1", chartBottom + 2)
      .attr("x2", x2)
      .attr("y2", chartBottom - 5);
  });
}

function appendBucketLabels(g, bins, meta, xScale, xDomainMin, chartBottom, belowY) {
  const tick = meta.tickFormat || ((d) => meta.format(d));
  const boundaries = bins.length ? [xDomainMin, ...bins.map((bin) => bin.x1)] : [xDomainMin];

  boundaries.forEach((value, index) => {
    if (index % 2 !== 0) return;

    const x = xScale(value);
    let anchor = "middle";
    if (index === 0) anchor = "start";
    else if (index === boundaries.length - 1) anchor = "end";

    g.append("line")
      .attr("class", "mini-hist-x-tick")
      .attr("x1", x)
      .attr("x2", x)
      .attr("y1", chartBottom)
      .attr("y2", chartBottom + 3);

    g.append("text")
      .attr("class", "mini-hist-bucket-label")
      .attr("x", x)
      .attr("y", belowY)
      .attr("text-anchor", anchor)
      .attr("dominant-baseline", "hanging")
      .text(value === 0 ? "0" : tick(value));
  });
}

function buildFeatureBarCard({ song, featureKey, eraName, eraRow, eraSongs, songRowLabel = "This song" }) {
  const value = song[featureKey];
  const baselineAvg = eraRow[featureKey];
  const { min: rangeMin, max: rangeMax } = representativeEraRange(eraSongs, featureKey);
  const meta = featureMeta[featureKey];
  return {
    key: featureKey,
    label: meta.label,
    valueLabel: meta.format(value),
    baselineLabel: meta.format(baselineAvg),
    normalized: normalizeWithBounds(value, rangeMin, rangeMax),
    baselineNormalized: normalizeWithBounds(baselineAvg, rangeMin, rangeMax),
    rangeMinLabel: meta.format(rangeMin),
    rangeMaxLabel: meta.format(rangeMax),
    eraColor: colors.eras["Streaming growth"],
    songColor: colors.ink,
    baselineRowLabel: "Era average",
    songRowLabel,
    deltaLabel: formatDelta(featureKey, value - baselineAvg),
  };
}

function renderMiniPairBars(selection, options = {}) {
  const defaultWidth = options.width || 210;
  const labelCol = 68;
  const barTop = 6;
  const rowStep = 20;
  const barHeight = 10;
  const scaleY = barTop + rowStep + barHeight + 5;

  selection.each(function (card) {
    const host = d3.select(this);
    host.selectAll("svg").remove();

    const width = options.width || card.barWidth || defaultWidth;
    const trackWidth = width - labelCol - 4;
    const height = scaleY + 11;
    const eraColor = card.eraColor || colors.eras["Streaming growth"];
    const songColor = card.songColor || colors.eras["Streaming native"];
    const baselineRowLabel = card.baselineRowLabel || "Era average";
    const songRowLabel = card.songRowLabel || "Top #1";

    const rows = [
      {
        label: baselineRowLabel,
        norm: card.baselineNormalized,
        color: eraColor,
        title: `${baselineRowLabel}: ${card.baselineLabel}`,
      },
      {
        label: songRowLabel,
        norm: card.normalized,
        color: songColor,
        title: `${songRowLabel}: ${card.valueLabel}`,
      },
    ];

    const svg = host
      .append("svg")
      .attr("class", "native-bar-svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", `${card.label} comparison bars`);

    const g = svg.append("g").attr("transform", `translate(${labelCol},${barTop})`);

    const row = g
      .selectAll(".mini-bar-row")
      .data(rows)
      .join("g")
      .attr("class", "mini-bar-row")
      .attr("transform", (_, index) => `translate(0,${index * rowStep})`);

    row
      .append("text")
      .attr("class", "mini-bar-label")
      .attr("x", -6)
      .attr("y", 9)
      .attr("text-anchor", "end")
      .text((d) => d.label);

    row
      .append("rect")
      .attr("class", "mini-bar-track")
      .attr("width", trackWidth)
      .attr("height", barHeight)
      .attr("rx", 2);

    row
      .append("rect")
      .attr("class", "mini-bar-fill")
      .attr("width", (d) => (barPct(d.norm) / 100) * trackWidth)
      .attr("height", barHeight)
      .attr("rx", 2)
      .attr("fill", (d) => d.color)
      .each(function (rowData) {
        d3.select(this).append("title").text(rowData.title);
      });

    g.append("text")
      .attr("class", "native-scale-label")
      .attr("x", 0)
      .attr("y", scaleY - barTop)
      .attr("dominant-baseline", "hanging")
      .text(`Low ${card.rangeMinLabel}`);

    g.append("text")
      .attr("class", "native-scale-label")
      .attr("x", trackWidth)
      .attr("y", scaleY - barTop)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "hanging")
      .text(`High ${card.rangeMaxLabel}`);
  });
}

function formatHistCount(count) {
  if (!Number.isFinite(count)) return "0";
  if (count >= 1000) return d3.format("~s")(count);
  return String(Math.round(count));
}

function renderMiniHistogram(selection, options = {}) {
  const defaultWidth = options.width || 210;
  const padX = 4;
  const yAxisWidth = 24;
  const meanLabelY = 8;
  const chartTop = 14;
  const chartHeight = 36;
  const chartBottom = chartTop + chartHeight;
  const bucketLabelY = chartBottom + 8;

  selection.each(function (card) {
    const host = d3.select(this);
    host.selectAll("svg").remove();

    const width = options.width || card.barWidth || defaultWidth;
    const trackWidth = width - padX * 2 - yAxisWidth;
    const eraColor = card.eraColor || colors.eras["Streaming growth"];
    const { rangeMin, rangeMax, xDomainMin } = card;
    const bins = card.histogram || [];
    const meta = featureMeta[card.featureKey] || { format: (d) => String(d) };
    const showAxisBreak = needsHistAxisBreak(card.featureKey, xDomainMin);
    const breakWidth = showAxisBreak ? 18 : 0;
    const plotLeft = breakWidth;
    const plotWidth = trackWidth - plotLeft;

    const xScale = d3
      .scaleLinear()
      .domain([xDomainMin, rangeMax])
      .range([plotLeft, trackWidth])
      .clamp(true);
    const maxCount = d3.max(bins, (d) => d.length) || 1;
    const barHeight = d3.scaleLinear().domain([0, maxCount]).range([0, chartHeight]);

    const svg = host
      .append("svg")
      .attr("class", "native-hist-svg")
      .attr("viewBox", `0 0 ${width} 1`)
      .attr("role", "img")
      .attr(
        "aria-label",
        `${card.label} histogram for era hits with era mean marked`
      );

    const yAxis = svg.append("g").attr("transform", `translate(${padX},0)`);

    yAxis
      .append("text")
      .attr("class", "mini-hist-y-title")
      .attr("transform", `translate(7, ${(chartTop + chartBottom) / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .text("Hits");

    yAxis
      .append("text")
      .attr("class", "mini-hist-y-label")
      .attr("x", yAxisWidth - 3)
      .attr("y", chartBottom)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .text("0");

    if (maxCount > 0) {
      yAxis
        .append("text")
        .attr("class", "mini-hist-y-label")
        .attr("x", yAxisWidth - 3)
        .attr("y", chartTop)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .text(formatHistCount(maxCount));
    }

    yAxis
      .append("line")
      .attr("class", "mini-hist-y-axis")
      .attr("x1", yAxisWidth)
      .attr("x2", yAxisWidth)
      .attr("y1", chartTop)
      .attr("y2", chartBottom);

    const g = svg.append("g").attr("transform", `translate(${padX + yAxisWidth},0)`);

    g.append("rect")
      .attr("class", "mini-hist-track")
      .attr("x", plotLeft)
      .attr("y", chartTop)
      .attr("width", plotWidth)
      .attr("height", chartHeight)
      .attr("rx", 2);

    g.selectAll(".mini-hist-bar")
      .data(bins)
      .join("rect")
      .attr("class", "mini-hist-bar")
      .attr("x", (bin) => miniHistBarGeometry(bin, xScale).x)
      .attr("y", (bin) => chartBottom - barHeight(bin.length))
      .attr("width", (bin) => miniHistBarGeometry(bin, xScale).width)
      .attr("height", (bin) => barHeight(bin.length))
      .attr("fill", eraColor)
      .append("title")
      .text(
        (bin) =>
          `${bin.length.toLocaleString()} hit${bin.length === 1 ? "" : "s"} · ${meta.format(bin.x0)} – ${meta.format(bin.x1)}`
      );

    g.append("line")
      .attr("class", "mini-hist-x-axis")
      .attr("x1", plotLeft)
      .attr("x2", trackWidth)
      .attr("y1", chartBottom)
      .attr("y2", chartBottom);

    if (Number.isFinite(card.baselineAvg)) {
      const meanX = xScale(card.baselineAvg);
      let meanAnchor = "middle";
      if (meanX < 22) meanAnchor = "start";
      else if (meanX > trackWidth - 22) meanAnchor = "end";

      g.append("line")
        .attr("class", "mini-hist-mean")
        .attr("x1", meanX)
        .attr("x2", meanX)
        .attr("y1", chartTop)
        .attr("y2", chartBottom)
        .append("title")
        .text(`Era average: ${card.baselineLabel}`);

      g.append("text")
        .attr("class", "mini-hist-mean-label")
        .attr("x", meanX)
        .attr("y", meanLabelY)
        .attr("text-anchor", meanAnchor)
        .attr("dominant-baseline", "middle")
        .text("Mean");
    }

    appendBucketLabels(g, bins, meta, xScale, xDomainMin, chartBottom, bucketLabelY);

    if (showAxisBreak) {
      appendHistAxisBreak(g, {
        chartBottom,
        bucketLabelY,
        plotLeft,
        zeroLabel: "0",
      });
    }

    const height = bucketLabelY + 10;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
  });
}

function renderIdealFeatureChart(container, row, eraName) {
  container.selectAll("*").remove();

  const chartFeatures = [
    "duration_min",
    "danceability",
    "energy",
    "loudness",
    "acousticness",
    "valence",
  ];

  const data = chartFeatures
    .map((key) => ({
      key,
      label: featureMeta[key].label,
      display: featureMeta[key].format(row[key]),
      value: row[key],
    }))
    .filter((d) => Number.isFinite(d.value));

  if (!data.length) return;

  const list = container
    .append("ul")
    .attr("class", "ideal-feature-list")
    .attr("role", "list")
    .attr("aria-label", `Ideal hit era averages for ${eraName}`);

  const items = list.selectAll("li").data(data, (d) => d.key).join("li").attr("class", "ideal-feature-item");

  items.append("span").attr("class", "ideal-feature-label").text((d) => d.label);
  items.append("span").attr("class", "ideal-feature-mean").text((d) => d.display);
}

function representativeEraRange(songsInEra, featureKey) {
  const values = songsInEra.map((d) => d[featureKey]).filter((d) => Number.isFinite(d));
  if (!values.length) return { min: NaN, max: NaN };
  return { min: d3.min(values), max: d3.max(values) };
}

function nativeProfileSongKey(song) {
  return `${song.Song}::${song.Performer}`;
}

function pickClosestToEraBaseline(candidates, featureKey, baseline) {
  return d3.least(candidates, (d) => {
    const value = d[featureKey];
    if (!Number.isFinite(value) || !Number.isFinite(baseline)) return Infinity;
    return Math.abs(value - baseline);
  });
}

function renderNativeProfile(songs, yearly, eraSummary, eraName) {
  const container = d3.select("#native-profile");
  const caption = d3.select("#native-profile-caption");
  if (container.empty()) return;
  const eraPhrase = `the ${eraName.toLowerCase()} era`;

  const eraSongs = songs.filter((d) => d.era === eraName);
  const latestYear = d3.max(eraSongs, (d) => d.year);
  const latestTopRaw = eraSongs.filter((d) => d.year === latestYear && d.best_rank === 1);
  const latestTopByKey = new Map();
  latestTopRaw.forEach((song) => {
    latestTopByKey.set(nativeProfileSongKey(song), song);
  });
  const latestTop = [...latestTopByKey.values()];
  const eraRow = eraSummary.find((d) => d?.era === eraName);
  if (!latestTop.length || !Number.isFinite(latestYear)) {
    container.html("<p>No chart-topper data available for this era.</p>");
    caption.text("");
    return;
  }
  if (!eraRow) {
    container.html("<p>No era baseline available.</p>");
    caption.text("");
    return;
  }

  const featureCards = [
    {
      key: "duration_min",
      label: "Duration",
      rule: "Closest to era-average duration among #1 hits in latest year",
      sentence: "sat closest to the era-average duration",
    },
    {
      key: "danceability",
      label: "Danceability",
      rule: "Closest to era-average danceability among #1 hits in latest year",
      sentence: "sat closest to the era-average danceability",
    },
    {
      key: "energy",
      label: "Energy",
      rule: "Closest to era-average energy among #1 hits in latest year",
      sentence: "sat closest to the era-average energy",
    },
    {
      key: "loudness",
      label: "Loudness",
      rule: "Closest to era-average loudness among #1 hits in latest year",
      sentence: "sat closest to the era-average loudness",
    },
    {
      key: "acousticness",
      label: "Acousticness",
      rule: "Closest to era-average acousticness among #1 hits in latest year",
      sentence: "sat closest to the era-average acousticness",
    },
    {
      key: "valence",
      label: "Valence",
      rule: "Closest to era-average valence among #1 hits in latest year",
      sentence: "sat closest to the era-average valence",
    },
  ];

  const cards = featureCards.map((cfg) => {
    const baselineAvg = eraRow[cfg.key];
    const song = pickClosestToEraBaseline(latestTop, cfg.key, baselineAvg) || latestTop[0];
    const value = song[cfg.key];
    const { min: rangeMin, max: rangeMax } = representativeEraRange(eraSongs, cfg.key);
    const xDomainMin = histXDomainMin(cfg.key, rangeMin);
    const normalized = normalizeWithBounds(value, rangeMin, rangeMax);
    const baselineNormalized = normalizeWithBounds(baselineAvg, rangeMin, rangeMax);
    const label = featureMeta[cfg.key]?.format ? featureMeta[cfg.key].format(value) : value.toFixed(3);
    const baselineLabel = featureMeta[cfg.key]?.format
      ? featureMeta[cfg.key].format(baselineAvg)
      : baselineAvg.toFixed(3);
    const rangeMinLabel = featureMeta[cfg.key]?.format
      ? featureMeta[cfg.key].format(rangeMin)
      : Number(rangeMin).toFixed(3);
    const rangeMaxLabel = featureMeta[cfg.key]?.format
      ? featureMeta[cfg.key].format(rangeMax)
      : Number(rangeMax).toFixed(3);
    const delta = value - baselineAvg;
    const eraValues = eraSongs.map((d) => d[cfg.key]).filter((d) => Number.isFinite(d));
    return {
      ...cfg,
      song,
      featureKey: cfg.key,
      valueLabel: label,
      baselineLabel,
      songValue: value,
      baselineAvg,
      deltaLabel: formatDelta(cfg.key, delta),
      normalized,
      baselineNormalized,
      rangeMin,
      rangeMax,
      xDomainMin,
      rangeMinLabel,
      rangeMaxLabel,
      histogram: featureHistogram(eraValues, xDomainMin, rangeMax),
      eraColor: colors.eras["Streaming growth"],
      songColor: colors.ink,
      baselineRowLabel: "Era average",
      songRowLabel: "Top #1",
    };
  });

  container.selectAll("*").remove();

  if (!caption.empty()) {
    caption.attr("aria-hidden", null).text(
      `Each card picks the #1 hit closest to the era average for that feature among recent chart-toppers in ${eraPhrase}. Histograms show how all Hot 100 hits in this era are distributed, with the era mean labeled.`
    );
  }

  const grid = container.append("div").attr("class", "native-profile-grid");
  const cardSel = grid.selectAll(".native-card").data(cards, (d) => d.key).join("article").attr("class", "native-card");

  cardSel.append("h4").text((d) => d.label);

  cardSel.append("div").attr("class", "native-hist-chart").call(renderMiniHistogram);

  const story = cardSel.append("div").attr("class", "native-story");
  const songLine = story.append("p").attr("class", "native-songline");
  songLine.append("strong").text((d) => d.song.Song);
  songLine.append("span").text((d) => ` · ${d.song.Performer}`);

  const metricLine = story.append("p").attr("class", "native-metricline");
  metricLine.append("span").text((d) => `${d.sentence}: `);
  metricLine.append("span").attr("class", "native-metric").text((d) => d.valueLabel);
  metricLine
    .append("span")
    .attr("class", "native-delta")
    .text((d) => `(Δ ${d.deltaLabel} vs average ${d.baselineLabel})`);

  cardSel
    .append("a")
    .attr("class", "native-play")
    .attr("target", "_blank")
    .attr("rel", "noopener noreferrer")
    .attr("href", (d) => toSpotifySearchUrl(d.song.Song, d.song.Performer))
    .text("Play on Spotify");
}

function renderIdealSong(eraSummary, eraName) {
  const container = d3.select("#ideal-song");
  if (container.empty()) return;

  const row = eraSummary.find((d) => d?.era === eraName);
  if (!row) {
    container.html("");
    return;
  }

  const eraBlurb = {
    "Pre-streaming":
      "Before streaming, hits skewed longer and more acoustic, with higher valence — music that could hold attention across radio and physical sales.",
    "Streaming growth":
      "As streaming grew, hits shifted toward louder, more danceable, higher-energy tracks — optimized for playlists and quick engagement.",
    "Streaming native":
      "In the streaming-native era, hits are shorter, punchier, and highly danceable, with lower acousticness and moodier valence — consistent with a skip-aware attention economy.",
  }[eraName];

  container.selectAll("*").remove();

  container.append("p").attr("class", "ideal-title").text('The “ideal hit” profile (from averages)');
  container.append("p").attr("class", "ideal-subtitle").text(eraBlurb);
  container
    .append("p")
    .attr("class", "ideal-note")
    .text("While these aren’t the traits of a real song, they reflect the average feature values of hits in this era.");

  const chartHost = container.append("div").attr("class", "ideal-song-chart").attr("id", "ideal-song-chart");
  renderIdealFeatureChart(chartHost, row, eraName);
}

function setProfileEra(nextEra) {
  profileEra = nextEra;
  document.querySelectorAll(".era-pill").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.era === nextEra);
  });
  renderNativeProfile(songsData, yearlyData, eraSummaryData, profileEra);
  renderIdealSong(eraSummaryData, profileEra);
}

function setupEraToggle() {
  document.querySelectorAll(".era-pill").forEach((btn) => {
    btn.addEventListener("click", () => setProfileEra(btn.dataset.era));
  });
}

function syncFeaturePills(featureKey, selector = ".feature-pill") {
  document.querySelectorAll(selector).forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.feature === featureKey);
  });
}

function setActiveFeature(featureKey, fromScroll = false) {
  if (!featureMeta[featureKey]) return;
  activeEraFeature = featureKey;
  eraComparisonChart(eraSummaryData, activeEraFeature, {
    chartSelector: "#era-comparison",
    captionSelector: "#era-caption",
    pillsSelector: ".feature-pill",
  });
  featureSparkline(yearlyData, eraSummaryData, activeEraFeature, {
    chartSelector: "#feature-sparkline",
  });
  if (!fromScroll) {
    scrollLocked = true;
    clearTimeout(scrollLockTimer);
    scrollLockTimer = setTimeout(() => {
      scrollLocked = false;
    }, 1200);
  }
}

function setupFeaturePills() {
  document.querySelectorAll(".feature-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      setActiveFeature(pill.dataset.feature);
    });
  });
}

function setupScrolly() {
  const steps = document.querySelectorAll(".scrolly-steps .step");
  if (!steps.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (scrollLocked) return;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const step = entry.target;
        const feature = step.dataset.feature;

        steps.forEach((s) => s.classList.toggle("is-active", s === step));

        if (feature) setActiveFeature(feature, true);
      });
    },
    { root: null, rootMargin: "-42% 0px -42% 0px", threshold: 0 }
  );

  steps.forEach((step) => observer.observe(step));
  steps[0]?.classList.add("is-active");
}

async function init() {
  const [yearly, eraSummary, songs, artistAverages, norms] = await Promise.all([
    d3.csv(files.yearly, parseRow),
    d3.csv(files.eraSummary, parseRow),
    d3.csv(files.songs, parseRow),
    d3.csv(files.artistAverages, parseRow),
    fetch(files.radarNorms).then((response) => response.json()),
  ]);

  eraSummaryData = eraOrder.map((era) => eraSummary.find((d) => d.era === era));
  yearlyData = yearly;
  songsData = songs;
  artistAveragesData = artistAverages.map((row) => ({
    ...row,
    artist_key: row.artist_key || normalizeArtistKey(row.artist),
  }));
  radarNorms = norms;

  setActiveFeature(activeEraFeature);
  setupFeaturePills();
  setupScrolly();
  setProfileEra(profileEra);
  setupEraToggle();
  setupSongCarousel();
  setupSongCompare();

  window.addEventListener(
    "resize",
    debounce(() => {
      setActiveFeature(activeEraFeature);
      setProfileEra(profileEra);
      renderSongCarousel();
      if (radarComparisonState?.series) {
        renderRadarChart(radarComparisonState.series);
      }
    }, 200)
  );
}

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

init();
