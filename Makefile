# Ember Noir — 24/7 fireplace channel build
# LOOP = seconds of seamless video loop
LOOP    ?= 60
FPS     ?= 30
WORKERS ?= 4
HOURS   ?= 10

.PHONY: all audio video master long stream stream-test branding preview clean

all: master

audio: build/fire_audio.wav
build/fire_audio.wav: audio/generate_fire_audio.py
	python3 audio/generate_fire_audio.py --minutes 10 --out $@

video: build/fire_loop.mp4
build/fire_loop.mp4: fireplace/index.html scripts/render_loop.js
	node scripts/render_loop.js --loop $(LOOP) --fps $(FPS) --workers $(WORKERS) --out $@

master: build/fireplace_master_1h.mp4
build/fireplace_master_1h.mp4: build/fire_loop.mp4 build/fire_audio.wav
	scripts/build_master.sh build/fire_loop.mp4 build/fire_audio.wav $@ 60

long: master
	scripts/make_long_video.sh $(HOURS)

stream: master
	scripts/stream_24_7.sh

stream-test: master
	DRY_RUN=1 scripts/stream_24_7.sh

branding:
	node scripts/render_branding.js

preview:
	@echo "Open fireplace/index.html in a browser (live, GPU-rendered)."

clean:
	rm -rf build
