from pathlib import Path

import kagglehub
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "processed"
DATASET = "thedevastator/billboard-hot-100-audio-features"

FEATURES = [
    "danceability",
    "energy",
    "loudness",
    "speechiness",
    "acousticness",
    "instrumentalness",
    "liveness",
    "valence",
    "tempo",
]


def era(year: int) -> str:
    if year < 2010:
        return "Pre-streaming"
    if year < 2020:
        return "Streaming growth"
    return "Streaming native"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = Path(kagglehub.dataset_download(DATASET))

    charts = pd.read_csv(source / "Hot Stuff.csv")
    audio = pd.read_csv(source / "Hot 100 Audio Features.csv")

    charts["date"] = pd.to_datetime(charts["WeekID"], errors="coerce")
    charts = charts.dropna(subset=["date", "SongID"])

    chart_summary = (
        charts.sort_values(["SongID", "date"])
        .groupby("SongID", as_index=False)
        .agg(
            first_chart_date=("date", "min"),
            best_rank=("Peak Position", "min"),
            max_weeks_on_chart=("Weeks on Chart", "max"),
            first_week_position=("Week Position", "first"),
        )
    )
    chart_summary["year"] = chart_summary["first_chart_date"].dt.year

    cols = [
        "SongID",
        "Performer",
        "Song",
        "spotify_genre",
        "spotify_track_duration_ms",
        "spotify_track_popularity",
        *FEATURES,
    ]
    songs = chart_summary.merge(audio[cols], on="SongID", how="inner")
    songs = songs.dropna(subset=["year", "spotify_track_duration_ms", *FEATURES])
    songs["duration_min"] = songs["spotify_track_duration_ms"] / 60000
    songs = songs[(songs["duration_min"] >= 1) & (songs["duration_min"] <= 8)]
    songs["era"] = songs["year"].astype(int).map(era)
    songs["display"] = songs["Song"].fillna("") + " - " + songs["Performer"].fillna("")

    yearly = (
        songs.groupby("year", as_index=False)
        .agg(
            songs=("SongID", "count"),
            duration_min=("duration_min", "mean"),
            danceability=("danceability", "mean"),
            energy=("energy", "mean"),
            loudness=("loudness", "mean"),
            acousticness=("acousticness", "mean"),
            valence=("valence", "mean"),
            tempo=("tempo", "mean"),
        )
        .query("songs >= 20")
    )

    diversity = (
        songs.groupby("year", as_index=False)
        .agg(
            songs=("SongID", "count"),
            danceability_sd=("danceability", "std"),
            energy_sd=("energy", "std"),
            acousticness_sd=("acousticness", "std"),
            valence_sd=("valence", "std"),
            duration_sd=("duration_min", "std"),
        )
        .query("songs >= 20")
    )
    diversity["feature_diversity"] = diversity[
        ["danceability_sd", "energy_sd", "acousticness_sd", "valence_sd"]
    ].mean(axis=1)

    era_summary = (
        songs.groupby("era", as_index=False)
        .agg(
            songs=("SongID", "count"),
            duration_min=("duration_min", "mean"),
            danceability=("danceability", "mean"),
            energy=("energy", "mean"),
            loudness=("loudness", "mean"),
            acousticness=("acousticness", "mean"),
            valence=("valence", "mean"),
        )
    )
    era_summary["era"] = pd.Categorical(
        era_summary["era"],
        ["Pre-streaming", "Streaming growth", "Streaming native"],
        ordered=True,
    )
    era_summary = era_summary.sort_values("era")

    duration_bins = [0, 2.5, 3, 3.5, 4, 5, 99]
    labels = ["<2:30", "2:30-2:59", "3:00-3:29", "3:30-3:59", "4:00-4:59", "5:00+"]
    duration_dist = songs.copy()
    duration_dist["duration_bucket"] = pd.cut(
        duration_dist["duration_min"], bins=duration_bins, labels=labels, right=False
    )
    duration_dist = (
        duration_dist.groupby(["era", "duration_bucket"], observed=True)
        .size()
        .reset_index(name="count")
    )
    duration_dist["era"] = pd.Categorical(
        duration_dist["era"],
        ["Pre-streaming", "Streaming growth", "Streaming native"],
        ordered=True,
    )
    duration_dist = duration_dist.sort_values(["era", "duration_bucket"])
    duration_dist["share"] = duration_dist.groupby("era", observed=True)["count"].transform(
        lambda x: x / x.sum()
    )

    scatter = (
        songs.sort_values(["year", "best_rank"])
        .groupby("year", group_keys=False)
        .head(80)
        .loc[
            :,
            [
                "year",
                "era",
                "Song",
                "Performer",
                "duration_min",
                "energy",
                "danceability",
                "loudness",
                "best_rank",
            ],
        ]
    )

    modern = songs[songs["year"] >= 2010].copy()
    modern["weird_score"] = (
        (modern["duration_min"] - modern["duration_min"].mean()) / modern["duration_min"].std()
        - (modern["energy"] - modern["energy"].mean()) / modern["energy"].std()
        + (modern["acousticness"] - modern["acousticness"].mean()) / modern["acousticness"].std()
        - (modern["danceability"] - modern["danceability"].mean()) / modern["danceability"].std()
    )
    outliers = modern.sort_values("weird_score", ascending=False).head(18)
    outliers = outliers[
        [
            "year",
            "Song",
            "Performer",
            "duration_min",
            "energy",
            "danceability",
            "acousticness",
            "best_rank",
            "max_weeks_on_chart",
            "weird_score",
        ]
    ]

    songs[
        [
            "SongID",
            "year",
            "era",
            "Song",
            "Performer",
            "duration_min",
            "danceability",
            "energy",
            "loudness",
            "acousticness",
            "valence",
            "tempo",
            "best_rank",
            "max_weeks_on_chart",
        ]
    ].to_csv(OUT / "songs.csv", index=False)
    yearly.to_csv(OUT / "yearly.csv", index=False)
    diversity.to_csv(OUT / "diversity.csv", index=False)
    era_summary.to_csv(OUT / "era_summary.csv", index=False)
    duration_dist.to_csv(OUT / "duration_distribution.csv", index=False)
    scatter.to_csv(OUT / "duration_energy_scatter.csv", index=False)
    outliers.to_csv(OUT / "outliers.csv", index=False)

    print(f"Wrote {len(songs):,} cleaned songs and proposal summaries to {OUT}")


if __name__ == "__main__":
    main()
