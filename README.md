# The Emergence of Us and Them

A browser-based classroom adaptation of the primary agent-based model in Gray et al. (2014), “The Emergence of ‘Us and Them’ in 80 Lines of Code.” The application is entirely client-side and can be hosted as a static site on GitHub Pages.

## Open the simulation

On a Mac, double-click **Open Group Simulation.command**. Keep the small Terminal window open while using the simulation. Your browser should open automatically. Press Control-C in Terminal when finished.

If macOS blocks the launcher the first time, right-click it, choose **Open**, and confirm.

## Alternative launch method

Open Terminal in this folder and run:

```sh
npm run dev
```

Then visit <http://localhost:3000>.

## Model fidelity

The simulation follows the published MATLAB sequence: probabilistic interaction, prisoner’s-dilemma choices, dyadic reciprocity, and transitive updating after mutual cooperation. It retains the paper’s clustering measure and adds a clearly labeled continuous cohesion measure without changing agent behavior.

## Development checks

```sh
npm test
```

## Static site build

Create the same static files that GitHub Pages will publish:

```sh
npm run build
```

The finished site is written to the `out` folder. The workflow in `.github/workflows/deploy-pages.yml` automatically builds and publishes that folder whenever the main branch is pushed to GitHub. In a project repository, the build automatically includes the repository name in asset paths; local builds and `username.github.io` repositories remain at the site root.
