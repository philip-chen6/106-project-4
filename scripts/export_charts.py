from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed"
OUT = ROOT / "charts"

BG = "#f7f4ef"
PANEL = "#fffdf8"
INK = "#191714"
MUTED = "#6d675f"
GRID = "#e7ded3"
ACCENT = "#d84f2a"
BLUE = "#2364aa"
GREEN = "#2f7d56"
ERA_COLORS = {
    "Pre-streaming": "#6d675f",
    "Streaming growth": "#2364aa",
    "Streaming native": "#d84f2a",
}


def style_ax(ax):
    ax.set_facecolor(PANEL)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#c9c0b4")
    ax.spines["bottom"].set_color("#c9c0b4")
    ax.tick_params(colors=MUTED, labelsize=9)
    ax.title.set_color(INK)
    ax.xaxis.label.set_color(MUTED)
    ax.yaxis.label.set_color(MUTED)


def save(fig, name):
    fig.tight_layout(pad=2)
    fig.savefig(OUT / name, dpi=220, facecolor=BG, bbox_inches="tight")
    plt.close(fig)


def main():
    OUT.mkdir(exist_ok=True)
    yearly = pd.read_csv(DATA / "yearly.csv")
    duration_dist = pd.read_csv(DATA / "duration_distribution.csv")
    scatter = pd.read_csv(DATA / "duration_energy_scatter.csv")
    diversity = pd.read_csv(DATA / "diversity.csv")
    outliers = pd.read_csv(DATA / "outliers.csv").head(9)

    fig, ax = plt.subplots(figsize=(10.5, 5.6), facecolor=BG)
    ax.plot(yearly["year"], yearly["duration_min"], color=ACCENT, linewidth=2.5)
    ax.axvline(2010, color=MUTED, linestyle="--", linewidth=1)
    ax.text(2010.8, yearly["duration_min"].max() - 0.08, "2010 streaming era marker", color=MUTED, fontsize=9)
    ax.set_title("Average Billboard Hot 100 Song Duration by Year", loc="left", fontsize=16, weight="bold")
    ax.set_xlabel("First chart year")
    ax.set_ylabel("Average duration (minutes)")
    style_ax(ax)
    save(fig, "01_duration_timeline.png")

    fig, ax = plt.subplots(figsize=(10.5, 5.6), facecolor=BG)
    bucket_order = ["<2:30", "2:30-2:59", "3:00-3:29", "3:30-3:59", "4:00-4:59", "5:00+"]
    duration_dist["duration_bucket"] = pd.Categorical(
        duration_dist["duration_bucket"],
        categories=bucket_order,
        ordered=True,
    )
    duration_dist = duration_dist.sort_values("duration_bucket")
    pivot = duration_dist.pivot(index="duration_bucket", columns="era", values="share")
    pivot = pivot.reindex(bucket_order)
    pivot = pivot[["Pre-streaming", "Streaming growth", "Streaming native"]]
    pivot.plot(kind="bar", ax=ax, color=[ERA_COLORS[c] for c in pivot.columns], width=0.72)
    ax.set_title("Song Duration Distribution by Era", loc="left", fontsize=16, weight="bold")
    ax.set_xlabel("Duration bucket")
    ax.set_ylabel("Share of songs")
    ax.yaxis.set_major_formatter(lambda x, _: f"{x:.0%}")
    ax.legend(frameon=False, fontsize=9)
    style_ax(ax)
    save(fig, "02_duration_distribution_by_era.png")

    for feature, ylabel, color, filename in [
        ("danceability", "Average danceability", BLUE, "03_danceability_over_time.png"),
        ("energy", "Average energy", ACCENT, "04_energy_over_time.png"),
        ("loudness", "Average loudness (dB)", GREEN, "05_loudness_over_time.png"),
    ]:
        fig, ax = plt.subplots(figsize=(10.5, 5.6), facecolor=BG)
        ax.plot(yearly["year"], yearly[feature], color=color, linewidth=2.5)
        ax.axvline(2010, color=MUTED, linestyle="--", linewidth=1)
        ax.set_title(f"{ylabel} by Year", loc="left", fontsize=16, weight="bold")
        ax.set_xlabel("First chart year")
        ax.set_ylabel(ylabel)
        style_ax(ax)
        save(fig, filename)

    fig, ax = plt.subplots(figsize=(10.5, 5.6), facecolor=BG)
    for era, group in scatter.groupby("era"):
        ax.scatter(group["duration_min"], group["energy"], s=11, alpha=0.28, color=ERA_COLORS[era], label=era)
    ax.set_title("Duration vs. Energy for Billboard Hits", loc="left", fontsize=16, weight="bold")
    ax.set_xlabel("Duration (minutes)")
    ax.set_ylabel("Energy")
    ax.legend(frameon=False, fontsize=9)
    style_ax(ax)
    save(fig, "06_duration_vs_energy.png")

    fig, ax = plt.subplots(figsize=(10.5, 5.6), facecolor=BG)
    ax.plot(diversity["year"], diversity["feature_diversity"], color=GREEN, linewidth=2.5)
    ax.axvline(2010, color=MUTED, linestyle="--", linewidth=1)
    ax.set_title("Audio Feature Diversity Over Time", loc="left", fontsize=16, weight="bold")
    ax.set_xlabel("First chart year")
    ax.set_ylabel("Average standard deviation")
    style_ax(ax)
    save(fig, "07_feature_diversity_over_time.png")

    table_rows = []
    for _, row in outliers.iterrows():
        table_rows.append(
            [
                f"{row['Song']} - {row['Performer']}",
                int(row["year"]),
                f"{row['duration_min']:.2f}",
                f"{row['energy']:.2f}",
                f"{row['acousticness']:.2f}",
                f"#{int(row['best_rank'])}",
            ]
        )
    fig, ax = plt.subplots(figsize=(12, 5.6), facecolor=BG)
    ax.axis("off")
    ax.set_title("Weird Modern Hits: Songs That Resist the Optimized Pattern", loc="left", fontsize=16, weight="bold", color=INK)
    table = ax.table(
        cellText=table_rows,
        colLabels=["Song", "Year", "Min", "Energy", "Acoustic", "Peak"],
        cellLoc="left",
        colLoc="left",
        loc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8.5)
    table.scale(1, 1.55)
    for (r, c), cell in table.get_celld().items():
        cell.set_edgecolor("#d8d0c4")
        cell.set_facecolor(PANEL if r else "#efe7dc")
        cell.set_text_props(color=INK if r else INK, weight="bold" if r == 0 else "normal")
    save(fig, "08_weird_modern_hits_table.png")

    print(f"Wrote PNG charts to {OUT}")


if __name__ == "__main__":
    main()
