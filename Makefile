all: Client.js Client.mjs Server.js Server.mjs

clean:
	rm Client.js Client.mjs Server.js Server.mjs

%.js: source/%.js
	npx babel $< --out-dir .
	
%.mjs: source/%.js
	cp $< $@;
	perl -pi -e "s~\b(import.+ from )(['\"])(?!node\:)([^'\"]+)\2~\1\2\3.mjs\2~g" $@;
