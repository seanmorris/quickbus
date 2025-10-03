all: index.js Client.js index.mjs Client.mjs Server.js Server.mjs

clean:
	rm -f index.js Client.js index.mjs Client.mjs Server.js Server.mjs

%.js: source/%.mjs
	npx babel $< --out-dir .
	
%.mjs: source/%.mjs
	cp $< $@;
