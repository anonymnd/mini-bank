       >>SOURCE FORMAT FREE
identification division.
program-id. hello.

data division.
working-storage section.
01 user-name pic x(40).

procedure division.
    display "What is your name?"
    accept user-name
    display "Hello, " function trim(user-name) "!"
    display "Welcome to your first COBOL app."
    stop run.
