COBC ?= cobc
CC ?= cc
CFLAGS ?= -std=c11 -Wall -Wextra -Werror -Wstrict-prototypes -Wmissing-prototypes -O2
COBFLAGS ?= -free -Wall

.PHONY: all test static check clean demo
all: build/minibank

build/schema.h: db/schema.sql tools/embed_schema.py
	mkdir -p build
	python3 tools/embed_schema.py $< $@

build/store.o: src/store.c src/store.h build/schema.h
	$(CC) $(CFLAGS) -Ibuild -c $< -o $@

build/minibank: src/main.cob src/payment.cob copybooks/payment.cpy build/store.o
	$(COBC) -x $(COBFLAGS) -I copybooks -o $@ src/main.cob src/payment.cob build/store.o -lsqlite3

static: build/schema.h
	$(CC) $(CFLAGS) -fanalyzer -Ibuild -c src/store.c -o build/store-analysis.o
	$(COBC) $(COBFLAGS) -Werror -fsyntax-only -I copybooks src/main.cob src/payment.cob
	python3 -m py_compile tools/*.py tests/*.py web/*.py
	bash -n tools/run.sh tools/web.sh

check: static test

test: all
	python3 -m unittest discover -s tests -v

demo: all
	mkdir -p data
	./build/minibank --db data/demo.db init
	./build/minibank --db data/demo.db batch samples/payments.dat; result=$$?; test $$result -eq 0 -o $$result -eq 4
	./build/minibank --db data/demo.db reconcile

clean:
	rm -f build/minibank build/store.o build/store-analysis.o build/schema.h
