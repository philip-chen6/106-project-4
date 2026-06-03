const files = {
  yearly: "data/processed/yearly.csv",
  diversity: "data/processed/diversity.csv",
  eraSummary: "data/processed/era_summary.csv",
  durationDist: "data/processed/duration_distribution.csv",
  scatter: "data/processed/duration_energy_scatter.csv",
  outliers: "data/processed/outliers.csv",
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

const tooltip = d3.select("#tooltip");
const state = {
  activeEra: "All",
};

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

function lineChart(selector, data, key, options = {}) {
  const frame = chartFrame(selector);
  const { g, innerWidth, innerHeight } = frame;
  const x = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.year))
    .range([0, innerWidth]);
  const y = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d[key]))
    .nice()
    .range([innerHeight, 0]);

  addGrid(g, x, y, innerWidth, innerHeight);

  g.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", options.color || colors.accent)
    .attr("stroke-width", 2.6)
    .attr(
      "d",
      d3
        .line()
        .x((d) => x(d.year))
        .y((d) => y(d[key]))
        .curve(d3.curveMonotoneX)
    );

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(7));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).ticks(5).tickFormat(options.format || undefined));

  g.append("line")
    .attr("x1", x(2010))
    .attr("x2", x(2010))
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("stroke", colors.ink)
    .attr("stroke-dasharray", "4 4")
    .attr("opacity", 0.5);

  g.append("text")
    .attr("class", "annotation")
    .attr("x", Math.min(x(2010) + 8, innerWidth - 130))
    .attr("y", 15)
    .text("2010 streaming era marker");

  g.selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", (d) => x(d.year))
    .attr("cy", (d) => y(d[key]))
    .attr("r", 3.2)
    .attr("fill", options.color || colors.accent)
    .attr("opacity", 0)
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("opacity", 1);
      showTip(event, `<strong>${d.year}</strong><br>${options.label}: ${options.value(d[key])}`);
    })
    .on("mouseleave", function () {
      d3.select(this).attr("opacity", 0);
      hideTip();
    });
}

function durationBars(data) {
  const frame = chartFrame("#duration-bars", { top: 16, right: 16, bottom: 70, left: 48 });
  const { g, innerWidth, innerHeight } = frame;
  const eras = ["Pre-streaming", "Streaming growth", "Streaming native"];
  const buckets = [...new Set(data.map((d) => d.duration_bucket))];
  const x0 = d3.scaleBand().domain(buckets).range([0, innerWidth]).padding(0.18);
  const x1 = d3.scaleBand().domain(eras).range([0, x0.bandwidth()]).padding(0.08);
  const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.share)]).nice().range([innerHeight, 0]);

  addGrid(g, x0, y, innerWidth, innerHeight);

  g.append("g")
    .selectAll("g")
    .data(d3.group(data, (d) => d.duration_bucket))
    .join("g")
    .attr("transform", ([bucket]) => `translate(${x0(bucket)},0)`)
    .selectAll("rect")
    .data(([, values]) => values)
    .join("rect")
    .attr("x", (d) => x1(d.era))
    .attr("y", (d) => y(d.share))
    .attr("width", x1.bandwidth())
    .attr("height", (d) => innerHeight - y(d.share))
    .attr("fill", (d) => colors.eras[d.era])
    .on("mouseenter", (event, d) => {
      showTip(
        event,
        `<strong>${d.era}</strong><br>${d.duration_bucket}: ${d3.format(".1%")(d.share)} of songs`
      );
    })
    .on("mouseleave", hideTip);

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x0))
    .selectAll("text")
    .attr("transform", "rotate(-35)")
    .attr("text-anchor", "end");

  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));

  const legend = g.append("g").attr("transform", `translate(${innerWidth - 148},8)`);
  eras.forEach((era, i) => {
    const row = legend.append("g").attr("transform", `translate(0,${i * 19})`);
    row.append("rect").attr("width", 10).attr("height", 10).attr("fill", colors.eras[era]);
    row.append("text").attr("x", 16).attr("y", 10).attr("class", "annotation").text(era);
  });
}

function scatterPlot(data) {
  const frame = chartFrame("#scatter", { top: 16, right: 16, bottom: 44, left: 48 });
  const { g, innerWidth, innerHeight } = frame;
  const x = d3.scaleLinear().domain([1, 7]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  addGrid(g, x, y, innerWidth, innerHeight);

  g.selectAll("circle")
    .data(data)
    .join("circle")
    .attr("cx", (d) => x(d.duration_min))
    .attr("cy", (d) => y(d.energy))
    .attr("r", 2.5)
    .attr("fill", (d) => colors.eras[d.era])
    .attr("opacity", (d) => (state.activeEra === "All" || d.era === state.activeEra ? 0.3 : 0.05))
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("opacity", 0.95).attr("r", 5);
      showTip(
        event,
        `<strong>${d.Song}</strong><br>${d.Performer}<br>${d.year}, ${d.duration_min.toFixed(
          2
        )} min, energy ${d.energy.toFixed(2)}`
      );
    })
    .on("mouseleave", function () {
      d3.select(this)
        .attr("opacity", (d) => (state.activeEra === "All" || d.era === state.activeEra ? 0.3 : 0.05))
        .attr("r", 2.5);
      hideTip();
    });

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

  g.append("text")
    .attr("class", "annotation")
    .attr("x", innerWidth - 105)
    .attr("y", innerHeight + 36)
    .text("Duration (minutes)");
  g.append("text")
    .attr("class", "annotation")
    .attr("x", -42)
    .attr("y", -6)
    .text("Energy");
}

function eraProfile(data) {
  const frame = chartFrame("#era-profile", { top: 16, right: 16, bottom: 64, left: 44 });
  const { g, innerWidth, innerHeight } = frame;
  const eras = ["Pre-streaming", "Streaming growth", "Streaming native"];
  const features = ["danceability", "energy", "acousticness", "valence"];
  const labels = {
    danceability: "Dance",
    energy: "Energy",
    acousticness: "Acoustic",
    valence: "Valence",
  };
  const flat = features.flatMap((feature) =>
    data.map((d) => ({
      feature,
      era: d.era,
      value: d[feature],
    }))
  );
  const x0 = d3.scaleBand().domain(features).range([0, innerWidth]).padding(0.2);
  const x1 = d3.scaleBand().domain(eras).range([0, x0.bandwidth()]).padding(0.08);
  const y = d3.scaleLinear().domain([0, 0.75]).range([innerHeight, 0]);

  addGrid(g, x0, y, innerWidth, innerHeight);

  g.append("g")
    .selectAll("g")
    .data(d3.group(flat, (d) => d.feature))
    .join("g")
    .attr("transform", ([feature]) => `translate(${x0(feature)},0)`)
    .selectAll("rect")
    .data(([, values]) => values)
    .join("rect")
    .attr("x", (d) => x1(d.era))
    .attr("y", (d) => y(d.value))
    .attr("width", x1.bandwidth())
    .attr("height", (d) => innerHeight - y(d.value))
    .attr("fill", (d) => colors.eras[d.era])
    .on("mouseenter", (event, d) => {
      showTip(
        event,
        `<strong>${d.era}</strong><br>${labels[d.feature]}: ${d.value.toFixed(3)}`
      );
    })
    .on("mouseleave", hideTip);

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x0).tickFormat((d) => labels[d]));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

  const legend = g.append("g").attr("transform", `translate(4,${innerHeight + 36})`);
  eras.forEach((era, i) => {
    const row = legend.append("g").attr("transform", `translate(${i * 128},0)`);
    row.append("rect").attr("width", 10).attr("height", 10).attr("fill", colors.eras[era]);
    row.append("text").attr("x", 16).attr("y", 10).attr("class", "annotation").text(era);
  });
}

function renderOutliers(data) {
  const frame = chartFrame("#outliers", { top: 16, right: 16, bottom: 44, left: 48 });
  if (!frame) return;

  const { g, innerWidth, innerHeight } = frame;
  const points = data.slice(0, 12);
  const x = d3
    .scaleLinear()
    .domain(d3.extent(points, (d) => d.duration_min))
    .nice()
    .range([0, innerWidth]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(points, (d) => d.energy) * 1.05])
    .range([innerHeight, 0]);
  const radius = d3
    .scaleSqrt()
    .domain(d3.extent(points, (d) => Math.abs(d.weird_score)))
    .range([5, 14]);

  addGrid(g, x, y, innerWidth, innerHeight);

  g.selectAll(".outlier-point")
    .data(points)
    .join("circle")
    .attr("class", "outlier-point")
    .attr("cx", (d) => x(d.duration_min))
    .attr("cy", (d) => y(d.energy))
    .attr("r", (d) => radius(Math.abs(d.weird_score)))
    .attr("fill", colors.accent)
    .attr("fill-opacity", 0.72)
    .attr("stroke", colors.ink)
    .attr("stroke-width", 1)
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("fill-opacity", 1).attr("r", radius(Math.abs(d.weird_score)) + 2);
      showTip(
        event,
        `<strong>${d.Song}</strong><br>${d.Performer} · ${d.year}<br>${d.duration_min.toFixed(
          2
        )} min · energy ${d.energy.toFixed(2)}<br>Peak #${Math.round(d.best_rank)}`
      );
    })
    .on("mouseleave", function (event, d) {
      d3.select(this).attr("fill-opacity", 0.72).attr("r", radius(Math.abs(d.weird_score)));
      hideTip();
    });

  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `${d} min`));

  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));

  frame.svg
    .append("text")
    .attr("class", "annotation axis-label-x")
    .attr("x", 48 + innerWidth / 2)
    .attr("y", 16 + innerHeight + 36)
    .attr("text-anchor", "middle")
    .text("Duration (min)");

  frame.svg
    .append("text")
    .attr("class", "annotation axis-label-y")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("transform", `translate(16, ${16 + innerHeight / 2}) rotate(-90)`)
    .text("Energy");
}

async function init() {
  const [yearly, diversity, eraSummary, durationDist, scatter, outliers] = await Promise.all([
    d3.csv(files.yearly, parseRow),
    d3.csv(files.diversity, parseRow),
    d3.csv(files.eraSummary, parseRow),
    d3.csv(files.durationDist, parseRow),
    d3.csv(files.scatter, parseRow),
    d3.csv(files.outliers, parseRow),
  ]);

  const durationLabel = {
    label: "Average duration",
    value: (d) => `${d.toFixed(2)} min`,
    color: colors.accent,
  };
  lineChart("#duration-line", yearly, "duration_min", durationLabel);
  durationBars(durationDist);
  eraProfile(eraSummary);
  scatterPlot(scatter);
  lineChart("#diversity-line", diversity, "feature_diversity", {
    label: "Feature diversity",
    value: (d) => d.toFixed(3),
    color: colors.green,
  });
  renderOutliers(outliers);

  d3.selectAll("[data-era]").on("click", function () {
    state.activeEra = this.dataset.era;
    d3.selectAll("[data-era]").attr("aria-pressed", "false");
    d3.select(this).attr("aria-pressed", "true");
    scatterPlot(scatter);
  });

  window.addEventListener(
    "resize",
    debounce(() => {
      lineChart("#duration-line", yearly, "duration_min", durationLabel);
      durationBars(durationDist);
      eraProfile(eraSummary);
      scatterPlot(scatter);
      lineChart("#diversity-line", diversity, "feature_diversity", {
        label: "Feature diversity",
        value: (d) => d.toFixed(3),
        color: colors.green,
      });
      renderOutliers(outliers);
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
