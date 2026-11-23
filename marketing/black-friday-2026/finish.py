"""Mux picture + soundtrack. Two-pass loudnorm to -14 LUFS / -1.5 dBTP (social platforms' target).
    python3 finish.py out/video-silent.mp4 out/music.wav out/final.mp4
"""
import json, re, subprocess, sys

video, audio, out = sys.argv[1:4]
probe = subprocess.run(['ffmpeg', '-hide_banner', '-i', audio, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
m = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', probe, re.S).group(0))
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
      f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-i', audio,
                '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', ln + ',aresample=48000',
                '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], check=True)
print('wrote', out)
