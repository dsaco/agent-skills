#!/usr/bin/env python3
"""Validate duration, format, signal level, clipping, and a basic loop-boundary discontinuity hint."""

import argparse
import json
import math
import os
import sys
import wave


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("--expected-seconds", type=float)
    parser.add_argument("--expected-rate", type=int, default=48000)
    parser.add_argument("--duration-tolerance", type=float, default=None)
    return parser.parse_args()


def iter_pcm_samples(raw: bytes, width: int):
    if width not in (1, 2, 3, 4):
        raise ValueError(f"unsupported PCM sample width: {width} bytes")
    for offset in range(0, len(raw) - width + 1, width):
        chunk = raw[offset:offset + width]
        if width == 1:
            yield chunk[0] - 128  # 8-bit PCM WAV is unsigned.
        else:
            yield int.from_bytes(chunk, "little", signed=True)


def level_stats(raw: bytes, width: int, channels: int):
    """Peak/RMS in dBFS, full-scale sample count, and runs of >= 2 consecutive
    full-scale samples per channel (flat tops left by clamping)."""
    full_scale = (1 << (8 * width - 1)) - 1
    peak = 0
    sum_squares = 0
    count = 0
    clipped_samples = 0
    clipped_runs = 0
    run = [0] * max(channels, 1)
    for index, sample in enumerate(iter_pcm_samples(raw, width)):
        magnitude = abs(sample)
        peak = max(peak, magnitude)
        sum_squares += sample * sample
        count += 1
        channel = index % len(run)
        if magnitude >= full_scale:
            clipped_samples += 1
            run[channel] += 1
            if run[channel] == 2:
                clipped_runs += 1
        else:
            run[channel] = 0
    if count == 0:
        return -240.0, -240.0, 0, 0
    rms = math.sqrt(sum_squares / count)
    peak_dbfs = 20 * math.log10(max(peak / float(full_scale), 1e-12))
    rms_dbfs = 20 * math.log10(max(rms / float(full_scale), 1e-12))
    return peak_dbfs, rms_dbfs, clipped_samples, clipped_runs


def decode_first_last(raw: bytes, width: int, channels: int):
    frame_size = width * channels
    if len(raw) < frame_size * 2:
        return None
    first = raw[:frame_size]
    last = raw[-frame_size:]
    values = []
    for channel in range(channels):
        offset = channel * width
        if width == 1:
            a = first[offset] - 128
            b = last[offset] - 128
        else:
            a = int.from_bytes(first[offset:offset + width], "little", signed=True)
            b = int.from_bytes(last[offset:offset + width], "little", signed=True)
        values.append(abs(a - b))
    full_scale = float(1 << (8 * width - 1))
    return max(values) / full_scale


def main():
    args = parse_args()
    failures = []
    warnings = []
    if not os.path.isfile(args.file):
        print(json.dumps({"ok": False, "failures": ["file does not exist"]}, indent=2))
        return 1

    try:
        with wave.open(args.file, "rb") as wav:
            channels = wav.getnchannels()
            width = wav.getsampwidth()
            rate = wav.getframerate()
            frames = wav.getnframes()
            compression = wav.getcomptype()
            raw = wav.readframes(frames)
    except (wave.Error, EOFError) as error:
        print(json.dumps({"ok": False, "failures": [f"invalid WAV: {error}"]}, indent=2))
        return 1

    duration = frames / rate if rate else 0.0
    peak_dbfs, rms_dbfs, clipped_samples, clipped_runs = level_stats(raw, width, channels)
    boundary_jump = decode_first_last(raw, width, channels)

    if compression != "NONE":
        failures.append(f"compressed WAV is not supported: {compression}")
    if rate != args.expected_rate:
        failures.append(f"sample rate is {rate}, expected {args.expected_rate}")
    if channels not in (1, 2):
        failures.append(f"unexpected channel count: {channels}")
    if frames == 0 or rms_dbfs < -80:
        failures.append("audio is empty or effectively silent")
    if clipped_runs:
        failures.append(
            f"clipping: {clipped_runs} runs of consecutive full-scale samples "
            f"({clipped_samples} samples); lower postgain or distortion and re-render"
        )
    elif peak_dbfs > -1.0:
        warnings.append("less than 1 dB peak headroom; lossy encoding (MP3/OGG) may clip")
    if args.expected_seconds is not None:
        tolerance = args.duration_tolerance
        if tolerance is None:
            tolerance = max(1.0 / rate, 0.001)
        if abs(duration - args.expected_seconds) > tolerance:
            failures.append(
                f"duration is {duration:.9f}s, expected {args.expected_seconds:.9f}s "
                f"(tolerance {tolerance:.9f}s)"
            )
    if boundary_jump is not None and boundary_jump > 0.1:
        warnings.append(
            f"large first/last sample jump ({boundary_jump:.4f} full-scale); "
            "listen to the loop boundary or use enhanced double-loop rendering"
        )

    result = {
        "ok": not failures,
        "file": os.path.abspath(args.file),
        "duration_seconds": round(duration, 9),
        "sample_rate": rate,
        "sample_width_bits": width * 8,
        "channels": channels,
        "frames": frames,
        "peak_dbfs": round(peak_dbfs, 3),
        "rms_dbfs": round(rms_dbfs, 3),
        "clipped_samples": clipped_samples,
        "clipped_runs": clipped_runs,
        "boundary_jump_full_scale": None if boundary_jump is None else round(boundary_jump, 6),
        "failures": failures,
        "warnings": warnings,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
