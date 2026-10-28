identification division.
program-id. payment-service.
environment division.
configuration section.
special-names.
    class reference-chars is "A" thru "Z" "0" thru "9" "-" "_"
    class account-chars is "A" thru "Z" "0" thru "9".
data division.
working-storage section.
01 db-result binary-long.
01 ignored-result binary-long.
01 amount-cents pic s9(18) comp-5.
01 source-balance pic s9(18) comp-5.
01 destination-balance pic s9(18) comp-5.
01 stored-cents pic s9(18) comp-5.
01 stored-source pic x(8).
01 stored-destination pic x(8).
01 stored-status pic x(8).
01 stored-reason pic x(40).
01 stored-original pic x(24).
01 i binary-long.
01 amount-length binary-long.
01 decimal-position binary-long.
01 transaction-open pic 9.
linkage section.
copy "payment.cpy".
procedure division using payment-request payment-response.
main-service.
    move 4 to response-code
    move spaces to response-reason
    move 0 to transaction-open amount-cents decimal-position

    if request-reference(1:1) = space or
        function trim(request-reference) is not reference-chars
        move "INVALID_REFERENCE" to response-reason
        goback
    end-if
    if request-action not = "PAY" and not = "REV"
        move "INVALID_ACTION" to response-reason
        goback
    end-if
    if request-action = "PAY"
        move spaces to request-original
        if request-source is not account-chars or
            request-destination is not account-chars
            move "INVALID_ACCOUNT_FORMAT" to response-reason
            goback
        end-if
        perform parse-amount
        if response-reason not = spaces goback end-if
    else
        if request-original(1:1) = space or
            function trim(request-original) is not reference-chars
            move "INVALID_ORIGINAL_REFERENCE" to response-reason
            goback
        end-if
    end-if

    call "mb_begin" returning db-result
    if db-result not = 0 perform technical-error goback end-if
    move 1 to transaction-open

    if request-action = "REV"
        call "mb_find" using request-original stored-source
            stored-destination stored-cents stored-status stored-reason
            stored-original returning db-result
        evaluate db-result
            when -1 perform technical-error goback
            when 0
                move "ORIGINAL_NOT_FOUND" to response-reason
                perform release-transaction goback
        end-evaluate
        if stored-status not = "POSTED" or stored-original not = spaces
            move "ORIGINAL_NOT_REVERSIBLE" to response-reason
            perform release-transaction goback
        end-if
        move stored-destination to request-source
        move stored-source to request-destination
        move stored-cents to amount-cents
    end-if

    call "mb_find" using request-reference stored-source
        stored-destination stored-cents stored-status stored-reason
        stored-original returning db-result
    if db-result = -1 perform technical-error goback end-if
    if db-result = 1
        evaluate true
            when stored-source not = request-source
            when stored-destination not = request-destination
            when stored-cents not = amount-cents
            when stored-original not = request-original
                move "REFERENCE_CONFLICT" to response-reason
            when stored-status = "POSTED"
                move 2 to response-code
                move "ALREADY_POSTED" to response-reason
            when other
                move stored-reason to response-reason
        end-evaluate
        perform release-transaction
        goback
    end-if

    if request-source = request-destination
        move "SAME_ACCOUNT" to response-reason
    end-if
    if request-action = "REV" and response-reason = spaces
        call "mb_reversed" using request-original returning db-result
        if db-result = -1 perform technical-error goback end-if
        if db-result = 1
            move "ALREADY_REVERSED" to response-reason
        end-if
    end-if
    if response-reason = spaces
        call "mb_account" using request-source source-balance
            returning db-result
        if db-result = -1 perform technical-error goback end-if
        if db-result = 0 move "UNKNOWN_SOURCE" to response-reason end-if
    end-if
    if response-reason = spaces
        call "mb_account" using request-destination destination-balance
            returning db-result
        if db-result = -1 perform technical-error goback end-if
        if db-result = 0
            move "UNKNOWN_DESTINATION" to response-reason
        end-if
    end-if
    if response-reason = spaces and source-balance < amount-cents
        move "INSUFFICIENT_FUNDS" to response-reason
    end-if
    if response-reason = spaces and
        destination-balance + amount-cents > 99999999999
        move "BALANCE_LIMIT" to response-reason
    end-if

    call "mb_write" using request-reference request-source
        request-destination amount-cents response-reason request-original
        returning db-result
    if db-result not = 0 perform technical-error goback end-if
    call "mb_commit" returning db-result
    if db-result not = 0 perform technical-error goback end-if
    move 0 to transaction-open
    if response-reason = spaces
        move 0 to response-code
        move "POSTED" to response-reason
    end-if
    goback.

parse-amount.
    move function length(function trim(request-amount)) to amount-length
    if amount-length < 4 or amount-length > 12
        move "INVALID_AMOUNT_USE_0.00" to response-reason
        exit paragraph
    end-if
    perform varying i from 1 by 1 until i > amount-length
        evaluate true
            when request-amount(i:1) = "."
                if decimal-position not = 0
                    move "INVALID_AMOUNT_USE_0.00" to response-reason
                    exit paragraph
                end-if
                move i to decimal-position
            when request-amount(i:1) < "0" or > "9"
                move "INVALID_AMOUNT_USE_0.00" to response-reason
                exit paragraph
        end-evaluate
    end-perform
    if decimal-position < 2 or decimal-position not = amount-length - 2
        move "INVALID_AMOUNT_USE_0.00" to response-reason
        exit paragraph
    end-if
    compute amount-cents = function numval(request-amount) * 100
    if amount-cents < 1 or amount-cents > 99999999999
        move "AMOUNT_OUT_OF_RANGE" to response-reason
    end-if.

release-transaction.
    if transaction-open = 1
        call "mb_rollback" returning ignored-result
        move 0 to transaction-open
        if ignored-result not = 0
            move 8 to response-code
            move "DATABASE_ERROR" to response-reason
        end-if
    end-if.

technical-error.
    perform release-transaction
    move 8 to response-code
    move "DATABASE_ERROR" to response-reason.
end program payment-service.
