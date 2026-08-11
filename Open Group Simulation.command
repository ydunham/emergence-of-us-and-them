#!/bin/zsh
cd "${0:A:h}"

if [[ ! -d node_modules ]]; then
  echo "Preparing the simulation for first use..."
  npm install
fi

echo "Opening The Emergence of Us and Them..."
echo "Keep this window open. Press Control-C here when you are finished."
(sleep 2; open "http://localhost:3000") &
npm run dev

