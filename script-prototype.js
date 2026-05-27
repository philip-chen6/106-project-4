const files = {
  yearly: "data/processed/yearly.csv",
  outliers: "data/processed/outliers.csv",
  eraSummary: "data/processed/era_summary.csv",
  songs: "data/processed/songs.csv",
};

const colors = {
  accent: "#d84f2a",
  blue: "#2364aa",
  green: "#2f7d56",
  gold: "#b57912",
  muted: "#6d675f",
  ink: "#191714",
  eras: {
    "Pre-streaming": "#6d675f",
    "Streaming growth": "#2364aa",
    "Streaming native": "#d84f2a",
  },
};

const eraOrder = ["Pre-streaming", "Streaming growth", "Streaming native"];

const featureMeta = {
  duration_min: {
    label: "Duration",
    axisLabel: "Duration (min)",
    tickFormat: (d) => d.toFixed(2),
    format: (d) => `${d.toFixed(2)} min`,
    caption:
      "Streaming-native hits are shorter on average — a pattern consistent with songs designed to hook listeners before they skip.",
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
      "Modern hits are louder. The loudness war didn't end with streaming — if anything, chart-toppers got punchier.",
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

const tooltip = d3.select("#tooltip");

let eraSummaryData = [];
let yearlyData = [];
let songsData = [];
let activeEraFeature = "duration_min";
let profileEra = "Streaming native";
let scrollLocked = false;
let scrollLockTimer = null;

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

function renderOutliers(data) {
  const container = d3.select("#outliers");
  if (container.empty()) return;

  const format = d3.format(".2f");
  container
    .selectAll(".outlier")
    .data(data.slice(0, 9))
    .join("div")
    .attr("class", "outlier")
    .html(
      (d) => `
        <strong>${d.Song}</strong>
        <span>${d.Performer} · ${d.year}</span>
        <dl>
          <dt>Duration</dt><dd>${format(d.duration_min)} min</dd>
          <dt>Energy</dt><dd>${format(d.energy)}</dd>
          <dt>Acoustic</dt><dd>${format(d.acousticness)}</dd>
          <dt>Peak</dt><dd>#${Math.round(d.best_rank)}</dd>
        </dl>
      `
    );
}

function toSpotifySearchUrl(song, performer) {
  const query = encodeURIComponent(`${song} ${performer}`);
  return `https://open.spotify.com/search/${query}`;
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

function barPct(normalized) {
  if (!Number.isFinite(normalized)) return 0;
  const pct = Math.round(normalized * 100);
  // Prevent “invisible” bars when value is at dataset min.
  return pct === 0 ? 2 : pct;
}

function representativeEraRange(songsInEra, featureKey) {
  const values = songsInEra.map((d) => d[featureKey]).filter((d) => Number.isFinite(d));
  if (!values.length) return { min: NaN, max: NaN };
  return { min: d3.min(values), max: d3.max(values) };
}

function renderNativeProfile(songs, yearly, eraSummary, eraName) {
  const container = d3.select("#native-profile");
  if (container.empty()) return;
  const eraPhrase = `this ${eraName.toLowerCase()} era`;

  const eraSongs = songs.filter((d) => d.era === eraName);
  const latestYear = d3.max(eraSongs, (d) => d.year);
  const latestTop = eraSongs.filter((d) => d.year === latestYear && d.best_rank === 1);
  const eraRow = eraSummary.find((d) => d?.era === eraName);
  if (!latestTop.length || !Number.isFinite(latestYear)) {
    container.html("<p>No chart-topper data available for this era.</p>");
    return;
  }
  if (!eraRow) {
    container.html("<p>No era baseline available.</p>");
    return;
  }

  const featureCards = [
    {
      key: "duration_min",
      label: "Duration",
      rule: "Shortest #1 song in latest year",
      sentence: "had the shortest duration",
      pick: (arr) => d3.least(arr, (d) => d.duration_min),
    },
    {
      key: "danceability",
      label: "Danceability",
      rule: "Most danceable #1 song in latest year",
      sentence: "was the most danceable",
      pick: (arr) => d3.greatest(arr, (d) => d.danceability),
    },
    {
      key: "energy",
      label: "Energy",
      rule: "Closest to average #1 energy in latest year",
      sentence: "was closest to the typical energy",
      pick: (arr) => d3.least(arr, (d) => Math.abs(d.energy - d3.mean(arr, (x) => x.energy))),
    },
    {
      key: "loudness",
      label: "Loudness",
      rule: "Loudest #1 song in latest year",
      sentence: "was the loudest",
      pick: (arr) => d3.greatest(arr, (d) => d.loudness),
    },
    {
      key: "acousticness",
      label: "Acousticness",
      rule: "Least acoustic #1 song in latest year",
      sentence: "was the least acoustic",
      pick: (arr) => d3.least(arr, (d) => d.acousticness),
    },
    {
      key: "valence",
      label: "Valence",
      rule: "Lowest-valence #1 song in latest year",
      sentence: "had the lowest valence",
      pick: (arr) => d3.least(arr, (d) => d.valence),
    },
  ];

  const cards = featureCards.map((cfg) => {
    const song = cfg.pick(latestTop) || latestTop[0];
    const value = song[cfg.key];
    const { min: rangeMin, max: rangeMax } = representativeEraRange(eraSongs, cfg.key);
    const normalized = normalizeWithBounds(value, rangeMin, rangeMax);
    const baselineAvg = eraRow[cfg.key];
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
    return {
      ...cfg,
      song,
      valueLabel: label,
      baselineLabel,
      deltaLabel: formatDelta(cfg.key, delta),
      normalized,
      baselineNormalized,
      rangeMinLabel,
      rangeMaxLabel,
    };
  });

  container.selectAll("*").remove();

  container
    .append("p")
    .attr("class", "native-profile-meta")
    .text("Bars compare a latest #1 example (orange) to the selected era’s average (blue).");

  const grid = container.append("div").attr("class", "native-profile-grid");
  const cardSel = grid.selectAll(".native-card").data(cards, (d) => d.key).join("article").attr("class", "native-card");

  cardSel.append("h4").text((d) => d.label);
  cardSel.append("p").attr("class", "native-rule").text((d) => d.rule.replace("latest year", eraPhrase));

  const barGroups = cardSel
    .append("div")
    .attr("class", "native-bar-group")
    .attr("aria-label", (d) => `${d.label} comparison bars`);

  const baselineRow = barGroups.append("div").attr("class", "native-bar-row");
  baselineRow.append("span").attr("class", "native-bar-label").text("Era average");
  baselineRow
    .append("div")
    .attr("class", "native-bar-track")
    .attr("title", (d) => `Era average: ${d.baselineLabel}`)
    .append("div")
    .attr("class", "native-bar-fill native-bar-fill-baseline")
    .style("width", (d) => `${Math.round(barPct(d.baselineNormalized))}%`);

  const topRow = barGroups.append("div").attr("class", "native-bar-row");
  topRow.append("span").attr("class", "native-bar-label").text("Top #1 example");
  topRow
    .append("div")
    .attr("class", "native-bar-track")
    .attr("title", (d) => `Top #1 example: ${d.valueLabel}`)
    .append("div")
    .attr("class", "native-bar-fill")
    .style("width", (d) => `${Math.round(barPct(d.normalized))}%`);

  const scaleRow = cardSel.append("div").attr("class", "native-scale-row").attr("aria-hidden", "true");
  const scaleTrack = scaleRow.append("div").attr("class", "native-scale-track");
  scaleTrack.append("span").attr("class", "native-scale-label").text((d) => `Low ${d.rangeMinLabel}`);
  scaleTrack.append("span").attr("class", "native-scale-label").text((d) => `High ${d.rangeMaxLabel}`);

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
      "In the streaming-native era, hits are shorter, punchier, and highly danceable, with lower acousticness and moodier valence — built to avoid skips.",
  }[eraName];

  container.selectAll("*").remove();

  container.append("p").attr("class", "ideal-title").text(`An “ideal hit” profile for ${eraName} (from averages)`);
  container.append("p").attr("class", "ideal-subtitle").text(eraBlurb);
  container
    .append("p")
    .attr("class", "ideal-note")
    .text("While these aren’t the traits of a real song, they reflect the average feature values of hits in this era.");

  const idealTraits = [
    { label: "Duration", value: featureMeta.duration_min.format(row.duration_min) },
    { label: "Danceability", value: featureMeta.danceability.format(row.danceability) },
    { label: "Energy", value: featureMeta.energy.format(row.energy) },
    { label: "Loudness", value: featureMeta.loudness.format(row.loudness) },
    { label: "Acousticness", value: featureMeta.acousticness.format(row.acousticness) },
    { label: "Valence", value: featureMeta.valence.format(row.valence) },
  ];

  const dl = container.append("dl").attr("class", "ideal-dl");
  const traitRows = dl.selectAll("div").data(idealTraits).join("div");
  traitRows.append("dt").text((d) => d.label);
  traitRows.append("dd").text((d) => d.value);
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
  const [yearly, outliers, eraSummary, songs] = await Promise.all([
    d3.csv(files.yearly, parseRow),
    d3.csv(files.outliers, parseRow),
    d3.csv(files.eraSummary, parseRow),
    d3.csv(files.songs, parseRow),
  ]);

  eraSummaryData = eraOrder.map((era) => eraSummary.find((d) => d.era === era));
  yearlyData = yearly;
  songsData = songs;

  setActiveFeature(activeEraFeature);
  setupFeaturePills();
  setupScrolly();
  renderOutliers(outliers);
  setProfileEra(profileEra);
  setupEraToggle();

  window.addEventListener(
    "resize",
    debounce(() => {
      setActiveFeature(activeEraFeature);
      renderOutliers(outliers);
      setProfileEra(profileEra);
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
