# Music to My Ears: Designed Not to Be Skipped

DSC 106 final project proposal and initial prototype.

This explorable explanation asks whether Billboard Hot 100 songs show signs of becoming more optimized for instant attention in the streaming era.

## Proposal

- Project title: Music to My Ears: Designed Not to Be Skipped
- Team members: Philip Chen, Elyse Wong, and Kyle Zhao
- Dataset: Billboard Hot weekly charts with Spotify audio features
- Static visualizations: six D3 charts on the proposal page

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

## Pages

- **Prototype** (interactive scrolly): `http://localhost:8000/`
- **Prototype Writeup** (proposal text and interactive D3 charts): `http://localhost:8000/proposal.html`

## Proposal Requirements Covered

- Project title
- Public dataset with more than 100 rows and 5 columns
- 5-10 line project writeup
- Six static proposal visualizations
- Initial explorable explanation structure for the final web page

## Initial Prototype Requirements Covered

- Webpage: GitHub Pages serves the project page
- GitHub repo: public-facing repo at `philip-chen6/106-project-4`
- Visualization: D3 charts render from processed CSV data
- Interaction: the duration vs. energy chart includes era filter buttons, and charts include hover details
- Writeup: the page answers both required prototype questions with at least four sentences each
