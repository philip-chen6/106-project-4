# Designed Not to Be Skipped

DSC 106 final project proposal prototype.

This explorable explanation asks whether Billboard Hot 100 songs show signs of becoming more optimized for instant attention in the streaming era.

## Dataset

Primary dataset: [Billboard Hot weekly charts with Spotify audio features](https://www.kaggle.com/datasets/thedevastator/billboard-hot-100-audio-features).

The dataset contains two files:

- `Hot Stuff.csv`: Billboard Hot 100 weekly chart records from 1958 onward.
- `Hot 100 Audio Features.csv`: Spotify-derived audio features for songs that appeared on the chart.

For the proposal page, `scripts/prepare_data.py` downloads the Kaggle dataset with `kagglehub`, merges the files by `SongID`, deduplicates songs by their first chart appearance, and writes smaller derived CSVs to `data/processed/`.

## Run Locally

```bash
python3 -m pip install --user kagglehub pandas
python3 scripts/prepare_data.py
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Proposal Requirements Covered

- Project title
- Public dataset with more than 100 rows and 5 columns
- 5-10 line project writeup
- Six static proposal visualizations
- Initial explorable explanation structure for the final web page
