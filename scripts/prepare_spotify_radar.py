"""Build artist averages and radar track lookup from the Spotify 1.2M+ songs dataset."""

from __future__ import annotations

import ast
import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "processed"
BILLBOARD = OUT / "songs.csv"
RAW_CACHE = ROOT / "data" / "raw" / "tracks_features.csv"

KAGGLE_DATASET = "rodolfofigueroa/spotify-12m-songs"

BILLBOARD_RADAR_FEATURES = [
    "duration_min",
    "danceability",
    "energy",
    "loudness",
    "acousticness",
    "valence",
]

ALREADY_SCALED = {
    "danceability",
    "energy",
    "acousticness",
    "valence",
}

LOOKUP_COLUMNS = [
    "track_name",
    "artists",
    "release_year",
    "era",
    *BILLBOARD_RADAR_FEATURES,
]

CHUNK_SIZE = 100_000


def era(year: int) -> str:
    if year < 2010:
        return "Pre-streaming"
    if year < 2020:
        return "Streaming growth"
    return "Streaming native"


def download_dataset() -> Path:
    if RAW_CACHE.exists():
        return RAW_CACHE

    try:
        import kagglehub

        source = Path(kagglehub.dataset_download(KAGGLE_DATASET))
        for name in ("tracks_features.csv", "dataset.csv"):
            candidate = source / name
            if candidate.exists():
                RAW_CACHE.parent.mkdir(parents=True, exist_ok=True)
                RAW_CACHE.write_bytes(candidate.read_bytes())
                return RAW_CACHE
        csv_files = sorted(source.glob("*.csv"), key=lambda p: p.stat().st_size, reverse=True)
        if csv_files:
            RAW_CACHE.parent.mkdir(parents=True, exist_ok=True)
            RAW_CACHE.write_bytes(csv_files[0].read_bytes())
            return RAW_CACHE
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            "Could not download the Spotify 1.2M+ songs dataset. Install kagglehub, configure "
            "Kaggle credentials, then run:\n"
            f"  kaggle datasets download -d {KAGGLE_DATASET} -p data/raw --unzip\n"
            "Place tracks_features.csv at data/raw/tracks_features.csv and re-run."
        ) from exc

    raise SystemExit(f"Dataset download succeeded but no CSV was found under {source}")


def normalize_artist(value: str) -> str:
    return re.sub(r"\s+", " ", str(value).strip().lower())


def split_artists(value: str) -> list[str]:
    text = str(value).strip()
    if text.startswith("["):
        try:
            parsed = ast.literal_eval(text)
            if isinstance(parsed, list):
                return [str(name).strip() for name in parsed if str(name).strip()]
        except (SyntaxError, ValueError):
            pass
    parts = re.split(r"\s*;\s*|\s*,\s*", text)
    return [part.strip() for part in parts if part.strip()]


def performer_lookup_keys(performer: str) -> set[str]:
    keys: set[str] = set()
    text = str(performer).strip()
    if not text:
        return keys
    keys.add(normalize_artist(text))
    for part in re.split(r"\s+feat\.?\s+|\s+&\s+|,|;", text, flags=re.IGNORECASE):
        part = part.strip()
        if part:
            keys.add(normalize_artist(part))
    return keys


def load_billboard_artist_keys() -> set[str]:
    if not BILLBOARD.exists():
        return set()
    keys: set[str] = set()
    performers = pd.read_csv(BILLBOARD, usecols=["Performer"])["Performer"].dropna()
    for performer in performers:
        keys.update(performer_lookup_keys(performer))
    return keys


def build_norms(df: pd.DataFrame) -> dict[str, dict[str, float | bool]]:
    norms: dict[str, dict[str, float | bool]] = {}
    for feature in BILLBOARD_RADAR_FEATURES:
        if feature in ALREADY_SCALED:
            norms[feature] = {"min": 0.0, "max": 1.0, "scaled": True}
        else:
            norms[feature] = {
                "min": float(df[feature].min()),
                "max": float(df[feature].max()),
                "scaled": False,
            }
    return norms


def release_year_column(df: pd.DataFrame) -> pd.Series:
    if "release_date" in df.columns:
        years = pd.to_datetime(df["release_date"], errors="coerce").dt.year
    else:
        years = pd.Series([pd.NA] * len(df), index=df.index)
    if "year" in df.columns:
        years = years.fillna(pd.to_numeric(df["year"], errors="coerce"))
    return years.astype("Int64")


def clean_chunk(df: pd.DataFrame) -> pd.DataFrame:
    rename = {"name": "track_name"}
    df = df.rename(columns={k: v for k, v in rename.items() if k in df.columns})
    required = ["track_name", "artists", "duration_ms", *ALREADY_SCALED, "loudness"]
    df = df.dropna(subset=[c for c in required if c in df.columns])
    df["duration_min"] = pd.to_numeric(df["duration_ms"], errors="coerce") / 60000
    df = df[(df["duration_min"] >= 1) & (df["duration_min"] <= 8)]
    df["release_year"] = release_year_column(df)
    df = df[df["release_year"].notna()].copy()
    df["release_year"] = df["release_year"].astype(int)
    df["era"] = df["release_year"].map(era)
    df["artists"] = df["artists"].map(parse_artists_list)
    return df


def parse_artists_list(value: str) -> str:
    return ";".join(split_artists(value))


class ArtistAccumulator:
    __slots__ = ("artist", "tracks", "sums")

    def __init__(self) -> None:
        self.artist = ""
        self.tracks = 0
        self.sums = {feature: 0.0 for feature in BILLBOARD_RADAR_FEATURES}

    def add(self, artist_name: str, row: pd.Series) -> None:
        self.tracks += 1
        if not self.artist:
            self.artist = artist_name
        for feature in BILLBOARD_RADAR_FEATURES:
            self.sums[feature] += float(row[feature])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source = download_dataset()
    billboard_keys = load_billboard_artist_keys()

    if BILLBOARD.exists():
        norms = build_norms(pd.read_csv(BILLBOARD))
    else:
        norms = None

    artist_stats: dict[str, ArtistAccumulator] = defaultdict(ArtistAccumulator)
    lookup_frames: list[pd.DataFrame] = []

    for chunk in pd.read_csv(source, chunksize=CHUNK_SIZE):
        chunk = clean_chunk(chunk)
        if chunk.empty:
            continue

        if norms is None:
            norms = build_norms(chunk)

        exploded = chunk.copy()
        exploded["artist_name"] = exploded["artists"].map(split_artists)
        exploded = exploded.explode("artist_name")
        exploded["artist_key"] = exploded["artist_name"].map(normalize_artist)

        grouped = exploded.groupby("artist_key", sort=False)
        for artist_key, group in grouped:
            if not artist_key:
                continue
            first_name = group["artist_name"].iloc[0]
            for _, row in group.iterrows():
                artist_stats[artist_key].add(first_name, row)

        if billboard_keys:
            matched = exploded[exploded["artist_key"].isin(billboard_keys)]
            if not matched.empty:
                lookup_frames.append(
                    matched.drop(columns=["artist_name", "artist_key"]).drop_duplicates(
                        subset=["track_name", "artists"]
                    )
                )

    artist_rows = []
    for artist_key, acc in artist_stats.items():
        if acc.tracks < 3:
            continue
        row = {
            "artist_key": artist_key,
            "artist": acc.artist,
            "tracks": acc.tracks,
        }
        for feature in BILLBOARD_RADAR_FEATURES:
            row[feature] = acc.sums[feature] / acc.tracks
        artist_rows.append(row)

    artist_avgs = (
        pd.DataFrame(artist_rows)
        .sort_values("tracks", ascending=False)
        .reset_index(drop=True)
    )

    if lookup_frames:
        lookup = pd.concat(lookup_frames, ignore_index=True).drop_duplicates(
            subset=["track_name", "artists"]
        )
    else:
        lookup = pd.DataFrame(columns=LOOKUP_COLUMNS)

    lookup = lookup[LOOKUP_COLUMNS]

    artist_avgs.to_csv(OUT / "artist_averages.csv", index=False)
    lookup.to_csv(OUT / "spotify_tracks_lookup.csv", index=False)
    (OUT / "radar_norms.json").write_text(json.dumps(norms, indent=2), encoding="utf-8")

    print(
        f"Wrote radar_norms.json, {len(artist_avgs):,} artist averages, "
        f"and {len(lookup):,} Spotify track rows to {OUT}"
    )


if __name__ == "__main__":
    main()
