# The Emergence of Us and Them

A local, browser-based classroom adaptation of the primary agent-based model in Gray et al. (2014), “The Emergence of ‘Us and Them’ in 80 Lines of Code.”

## Open the simulation

On a Mac, double-click **Open Group Simulation.command**. Keep the small Terminal window open while using the simulation. Your browser should open automatically. Press Control-C in Terminal when finished.

If macOS blocks the launcher the first time, right-click it, choose **Open**, and confirm.

## Alternative launch method

Open Terminal in this folder and run:

```sh
npm run dev -- --open
```

Then visit <http://localhost:3000>.

## Model fidelity

The simulation follows the published MATLAB sequence: probabilistic interaction, prisoner’s-dilemma choices, dyadic reciprocity, and transitive updating after mutual cooperation. It retains the paper’s clustering measure and adds a clearly labeled continuous cohesion measure without changing agent behavior.

## Development checks

```sh
npm test
```

