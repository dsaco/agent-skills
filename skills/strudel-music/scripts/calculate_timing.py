#!/usr/bin/env python3
"""Calculate bar-aligned timing options for Strudel music production."""

import argparse
import json
import math


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bpm", type=float, required=True)
    parser.add_argument("--beats-per-bar", type=float, default=4)
    parser.add_argument("--seconds", type=float, required=True)
    parser.add_argument("--phrase-bars", type=int, default=4)
    args = parser.parse_args()

    if args.bpm <= 0 or args.beats_per_bar <= 0 or args.seconds <= 0:
        parser.error("bpm, beats-per-bar, and seconds must be positive")

    seconds_per_bar = args.beats_per_bar * 60 / args.bpm
    exact_bars = args.seconds / seconds_per_bar
    candidates = set()
    floor_bar = max(1, math.floor(exact_bars))
    ceil_bar = max(1, math.ceil(exact_bars))
    candidates.update((floor_bar, ceil_bar))

    phrase = max(1, args.phrase_bars)
    lower_phrase = max(phrase, math.floor(exact_bars / phrase) * phrase)
    upper_phrase = max(phrase, math.ceil(exact_bars / phrase) * phrase)
    candidates.update((lower_phrase, upper_phrase))

    options = []
    for bars in sorted(candidates):
        actual_seconds = bars * seconds_per_bar
        exact_duration_bpm = bars * args.beats_per_bar * 60 / args.seconds
        options.append({
            "bars": bars,
            "seconds_at_requested_bpm": round(actual_seconds, 9),
            "difference_seconds": round(actual_seconds - args.seconds, 9),
            "bpm_for_exact_requested_duration": round(exact_duration_bpm, 9),
            "phrase_aligned": bars % phrase == 0,
        })

    result = {
        "requested": {
            "bpm": args.bpm,
            "beats_per_bar": args.beats_per_bar,
            "seconds": args.seconds,
            "phrase_bars": phrase,
        },
        "setcpm": args.bpm / args.beats_per_bar,
        "seconds_per_bar": round(seconds_per_bar, 9),
        "exact_bar_count": round(exact_bars, 9),
        "is_integer_bar_count": math.isclose(exact_bars, round(exact_bars), abs_tol=1e-9),
        "options": options,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
