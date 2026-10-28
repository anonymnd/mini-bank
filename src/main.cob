identification division.
program-id. minibank.
environment division.
input-output section.
file-control.
    select payment-file assign to input-path
        organization is sequential
        file status is input-status.
data division.
file section.
fd payment-file
    record contains 1 characters.
01 input-byte pic x.
working-storage section.
copy "payment.cpy".
01 db-path pic x(512) value "minibank.db".
01 db-path-z pic x(513).
01 input-path pic x(512).
01 input-path-z pic x(513).
01 query-z pic x(1025).
01 raw-z pic x(4097).
01 input-status pic xx.
01 record-length binary-long.
01 payment-line pic x(4096).
01 record-overflow pic 9.
01 record-index binary-long.
01 argument-count binary-long.
01 argument-position binary-long value 0.
01 input-value pic x(1024).
01 command-name pic x(20).
01 create-database binary-long value 0.
01 db-result binary-long.
01 ignored-result binary-long.
01 exit-code binary-long value 0.
01 database-open pic 9 value 0.
01 menu-choice pic x(1024).
01 confirmed pic 9.
01 end-of-file pic 9.
01 batch-id pic s9(18) comp-5.
01 line-number binary-long.
01 posted-count binary-long.
01 retried-count binary-long.
01 rejected-count binary-long.
01 display-count pic Z(9)9.

procedure division.
start-app.
    accept argument-count from argument-number
    perform next-argument
    if input-value = "--db"
        perform next-argument
        if input-value = spaces or
            function length(function trim(input-value)) > 512
            perform usage-error
        end-if
        move input-value to db-path
        perform next-argument
    end-if
    if input-value = spaces move "menu" to input-value end-if
    if function length(function trim(input-value)) > 20
        perform usage-error
    end-if
    move input-value to command-name
    if command-name = "help" or "--help"
        perform show-help
        perform shutdown
    end-if
    if command-name = "init" move 1 to create-database end-if
    move low-values to db-path-z
    string function trim(db-path) x"00" into db-path-z end-string
    call "mb_open" using db-path-z create-database returning db-result
    if db-result not = 0
        display "Cannot open database. Use: minibank [--db PATH] init"
        move 8 to exit-code
        perform shutdown
    end-if
    move 1 to database-open
    evaluate command-name
        when "init"
            perform require-end
            call "mb_init" returning db-result
            perform check-database-result
            display "Demo database ready: " function trim(db-path)
            display "Fictional data only. Currency: MAD."
        when "accounts"
            perform next-argument
            if function length(function trim(input-value)) > 80
                perform usage-error
            end-if
            perform list-accounts
            perform require-end
        when "history"
            perform next-argument
            if function length(function trim(input-value)) not = 8
                perform usage-error
            end-if
            move input-value to request-source
            perform require-end
            perform show-history
        when "transfer"
            initialize payment-request
            move "PAY" to request-action
            perform read-cli-reference
            perform next-argument
            if function length(function trim(input-value)) not = 8
                perform usage-error
            end-if
            move input-value to request-source
            perform next-argument
            if function length(function trim(input-value)) not = 8
                perform usage-error
            end-if
            move input-value to request-destination
            perform next-argument
            if function length(function trim(input-value)) > 20
                perform usage-error
            end-if
            move input-value to request-amount
            perform require-end
            perform submit-payment
            move response-code to exit-code
            if exit-code = 2 move 0 to exit-code end-if
        when "reverse"
            initialize payment-request
            move "REV" to request-action
            perform read-cli-reference
            perform next-argument
            if input-value = spaces or
                function length(function trim(input-value)) > 24
                perform usage-error
            end-if
            move input-value to request-original
            perform require-end
            perform submit-payment
            move response-code to exit-code
            if exit-code = 2 move 0 to exit-code end-if
        when "batch"
            perform next-argument
            if input-value = spaces or
                function length(function trim(input-value)) > 512
                perform usage-error
            end-if
            move input-value to input-path
            perform require-end
            perform run-batch
        when "reconcile"
            perform require-end
            perform reconcile-accounts
        when "rejects"
            perform require-end
            call "mb_rejects" returning db-result
            perform check-database-result
        when "runs"
            perform require-end
            call "mb_runs" returning db-result
            perform check-database-result
        when "menu"
            perform require-end
            perform terminal-menu
        when other perform usage-error
    end-evaluate
    perform shutdown.

next-argument.
    move spaces to input-value
    if argument-position < argument-count
        accept input-value from argument-value
        add 1 to argument-position
    end-if.

require-end.
    if argument-position < argument-count perform usage-error end-if.

read-cli-reference.
    perform next-argument
    if input-value = spaces or
        function length(function trim(input-value)) > 24
        perform usage-error
    end-if
    move input-value to request-reference.

submit-payment.
    call "payment-service" using payment-request payment-response
    display function trim(request-reference) " | "
        function trim(response-reason).

list-accounts.
    move low-values to query-z
    string function trim(input-value) x"00" into query-z end-string
    call "mb_accounts" using query-z returning db-result
    perform check-database-result.

show-history.
    call "mb_history" using request-source returning db-result
    perform check-database-result
    if db-result = 4 move 4 to exit-code end-if.

reconcile-accounts.
    call "mb_reconcile" returning db-result
    perform check-database-result
    if db-result = 4 move 4 to exit-code end-if.

run-batch.
    open input payment-file
    if input-status not = "00"
        display "FILE_ERROR: cannot open " function trim(input-path)
        move 8 to exit-code
        exit paragraph
    end-if
    move low-values to input-path-z
    string function trim(input-path) x"00" into input-path-z end-string
    call "mb_batch_start" using input-path-z batch-id returning db-result
    perform check-database-result
    move 0 to end-of-file line-number posted-count retried-count
        rejected-count record-length record-overflow
    move spaces to payment-line
    perform until end-of-file = 1
        read payment-file
        evaluate input-status
            when "10"
                if record-length > 0 or record-overflow = 1
                    perform complete-batch-line
                end-if
                move 1 to end-of-file
            when "00"
                if input-byte = x"0a"
                    if record-length > 0 and record-overflow = 0
                        if payment-line(record-length:1) = x"0d"
                            subtract 1 from record-length
                        end-if
                    end-if
                    perform complete-batch-line
                else
                    if record-length < 4096
                        add 1 to record-length
                        move input-byte to payment-line(record-length:1)
                    else move 1 to record-overflow end-if
                end-if
            when other
                display "FILE_ERROR: status " input-status
                    "; batch incomplete; fix input and replay."
                move 8 to exit-code
                move 1 to end-of-file
        end-evaluate
    end-perform
    close payment-file
    if exit-code = 8 exit paragraph end-if
    call "mb_batch_finish" using batch-id posted-count retried-count
        rejected-count returning db-result
    perform check-database-result
    display "BATCH COMPLETED"
    move posted-count to display-count
    display "Posted: " function trim(display-count)
    move retried-count to display-count
    display "Exact retries: " function trim(display-count)
    move rejected-count to display-count
    display "Rejected: " function trim(display-count)
    if rejected-count > 0 move 4 to exit-code end-if.

complete-batch-line.
    add 1 to line-number
    perform process-batch-line
    if response-code = 8
        move 8 to exit-code
        move 1 to end-of-file
    end-if
    move 0 to record-length record-overflow
    move spaces to payment-line.

process-batch-line.
    initialize payment-request payment-response
    if record-length not = 52 or record-overflow = 1
        move 4 to response-code
        move "INVALID_RECORD_LENGTH_EXPECT_52" to response-reason
    else
        perform varying record-index from 1 by 1 until record-index > 52
            if payment-line(record-index:1) < space or > "~"
                move 4 to response-code
                move "INVALID_RECORD_CHARACTER" to response-reason
            end-if
        end-perform
        if payment-line(41:9) is not numeric or
            payment-line(50:1) not = "." or
            payment-line(51:2) is not numeric
            move 4 to response-code
            move "INVALID_BATCH_AMOUNT_FORMAT" to response-reason
        end-if
        if response-code = 0
            move "PAY" to request-action
            move payment-line(1:24) to request-reference
            move payment-line(25:8) to request-source
            move payment-line(33:8) to request-destination
            move payment-line(41:12) to request-amount
            perform submit-payment
        end-if
    end-if
    evaluate response-code
        when 0 add 1 to posted-count
        when 2 add 1 to retried-count
        when 4
            add 1 to rejected-count
            move low-values to raw-z
            if record-length > 0
                string payment-line(1:record-length) x"00"
                    into raw-z end-string
            end-if
            call "mb_batch_reject" using batch-id line-number raw-z
                record-length response-reason returning db-result
            if db-result not = 0 move 8 to response-code end-if
            move line-number to display-count
            display "Rejected line " function trim(display-count) ": "
                function trim(response-reason)
    end-evaluate.

terminal-menu.
    display " "
    display "MINIBANK | Banking operations portfolio | MAD"
    display "Database: " function trim(db-path)
    display "Fictional customers. Local single-operator environment."
    move spaces to menu-choice
    perform until menu-choice = "0"
        display " "
        display "1  Find customer / account"
        display "2  Account history"
        display "3  Transfer money"
        display "4  Import payment file"
        display "5  Reconcile accounts"
        display "6  View batch rejections"
        display "7  Reverse a transfer"
        display "8  Batch run history"
        display "0  Exit"
        display "Choose an option: " with no advancing
        perform read-console
        move input-value to menu-choice
        evaluate menu-choice
            when "1"
                display "Name or account (blank = all): " with no advancing
                perform read-console
                if function length(function trim(input-value)) > 80
                    display "Search is limited to 80 characters."
                else perform list-accounts end-if
            when "2"
                display "Account ID (8 characters): " with no advancing
                perform read-console
                if function length(function trim(input-value)) = 8
                    move input-value to request-source
                    perform show-history
                else display "Enter exactly 8 characters." end-if
            when "3" perform terminal-transfer
            when "4"
                display "Payment file path: " with no advancing
                perform read-console
                if input-value = spaces or
                    function length(function trim(input-value)) > 512
                    display "Enter a path of 1 to 512 characters."
                else
                    move input-value to input-path
                    move 0 to exit-code
                    perform run-batch
                end-if
            when "5" perform reconcile-accounts
            when "6"
                call "mb_rejects" returning db-result
                perform check-database-result
            when "7" perform terminal-reversal
            when "8"
                call "mb_runs" returning db-result
                perform check-database-result
            when "0" continue
            when other display "Choose a number from 0 to 8."
        end-evaluate
    end-perform
    move 0 to exit-code.

terminal-transfer.
    initialize payment-request
    move "PAY" to request-action
    display "Unique reference (A-Z, 0-9, _ or -, max 24): "
        with no advancing
    perform read-console
    if input-value = spaces or
        function length(function trim(input-value)) > 24
        display "Invalid reference length." exit paragraph
    end-if
    move input-value to request-reference
    display "From account: " with no advancing
    perform read-console
    if function length(function trim(input-value)) not = 8
        display "Enter exactly 8 characters." exit paragraph
    end-if
    move input-value to request-source
    display "To account: " with no advancing
    perform read-console
    if function length(function trim(input-value)) not = 8
        display "Enter exactly 8 characters." exit paragraph
    end-if
    move input-value to request-destination
    display "Amount MAD (example 125.50): " with no advancing
    perform read-console
    if function length(function trim(input-value)) > 20
        display "Invalid amount length." exit paragraph
    end-if
    move input-value to request-amount
    display "Transfer MAD " function trim(request-amount) " from "
        request-source " to " request-destination
    perform confirm-operation
    if confirmed = 1 perform submit-payment end-if.

terminal-reversal.
    initialize payment-request
    move "REV" to request-action
    display "Original payment reference: " with no advancing
    perform read-console
    if input-value = spaces or
        function length(function trim(input-value)) > 24
        display "Invalid reference length." exit paragraph
    end-if
    move input-value to request-original
    display "New reversal reference: " with no advancing
    perform read-console
    if input-value = spaces or
        function length(function trim(input-value)) > 24
        display "Invalid reference length." exit paragraph
    end-if
    move input-value to request-reference
    display "Reverse " function trim(request-original) " using reference "
        function trim(request-reference)
    perform confirm-operation
    if confirmed = 1 perform submit-payment end-if.

confirm-operation.
    move 0 to confirmed
    display "Type YES to confirm: " with no advancing
    perform read-console
    if input-value = "YES"
        move 1 to confirmed
    else display "Cancelled; nothing was posted." end-if.

read-console.
    move spaces to input-value
    accept input-value
        on exception
            display "End of input."
            move 0 to exit-code
            perform shutdown
    end-accept.

check-database-result.
    if db-result < 0
        move 8 to exit-code
        perform shutdown
    end-if.

usage-error.
    display "Invalid command or arguments."
    perform show-help
    move 8 to exit-code
    perform shutdown.

show-help.
    display "Usage: minibank [--db PATH] COMMAND [arguments]"
    display "  init                                  Create demo data safely"
    display "  menu                                  Interactive operations"
    display "  accounts [SEARCH]                     Find customer/accounts"
    display "  history ACCOUNT                       Ledger history"
    display "  transfer REF FROM TO AMOUNT            Example: 125.50"
    display "  reverse NEW-REF ORIGINAL-REF           Compensating payment"
    display "  batch PATH                            Import 52-byte records"
    display "  reconcile                             Verify financial controls"
    display "  rejects                               Latest 100 batch rejects"
    display "  runs                                  Latest 100 batch runs"
    display "Exit: 0 success/retry, 4 business rejects, 8 usage/technical error".

shutdown.
    if database-open = 1
        call "mb_close" returning ignored-result
        if ignored-result not = 0 move 8 to exit-code end-if
    end-if
    move exit-code to return-code
    stop run.
end program minibank.
