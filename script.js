const files = {
  yearly: "data/processed/yearly.csv",
  diversity: "data/processed/diversity.csv",
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
    "Pre-streaming": "#6d675f",
    "Streaming growth": "#2364aa",
    "Streaming native": "#d84f2a",
  },
};

const tooltip = d3.select("#tooltip");

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
    .attr("opacity", 0.28)
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
      d3.select(this).attr("opacity", 0.28).attr("r", 2.5);
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

function renderOutliers(data) {
  const container = d3.select("#outliers");
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

async function init() {
  const [yearly, diversity, durationDist, scatter, outliers] = await Promise.all([
    d3.csv(files.yearly, parseRow),
    d3.csv(files.diversity, parseRow),
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
  scatterPlot(scatter);
  lineChart("#diversity-line", diversity, "feature_diversity", {
    label: "Feature diversity",
    value: (d) => d.toFixed(3),
    color: colors.green,
  });
  renderOutliers(outliers);

  const featureSelect = document.querySelector("#feature-select");
  const featureLabels = {
    danceability: "Danceability",
    energy: "Energy",
    loudness: "Loudness",
    acousticness: "Acousticness",
    valence: "Valence",
    tempo: "Tempo",
  };
  const formatters = {
    loudness: (d) => `${d.toFixed(1)} dB`,
    tempo: (d) => `${d.toFixed(1)} BPM`,
    default: (d) => d.toFixed(3),
  };

  function renderFeature() {
    const key = featureSelect.value;
    lineChart("#feature-line", yearly, key, {
      label: featureLabels[key],
      value: formatters[key] || formatters.default,
      color: colors.blue,
    });
  }

  featureSelect.addEventListener("change", renderFeature);
  renderFeature();

  window.addEventListener(
    "resize",
    debounce(() => {
      lineChart("#duration-line", yearly, "duration_min", durationLabel);
      durationBars(durationDist);
      scatterPlot(scatter);
      lineChart("#diversity-line", diversity, "feature_diversity", {
        label: "Feature diversity",
        value: (d) => d.toFixed(3),
        color: colors.green,
      });
      renderFeature();
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
