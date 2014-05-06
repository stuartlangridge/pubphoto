#!/bin/bash
for SIZE in 144 114 72 57 32 16; do
    inkscape -z -f icon.svg -e icon-$SIZE.png -w $SIZE;
done


