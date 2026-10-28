01 payment-request.
   05 request-action          pic x(3).
   05 request-reference       pic x(24).
   05 request-source          pic x(8).
   05 request-destination     pic x(8).
   05 request-amount          pic x(20).
   05 request-original        pic x(24).
01 payment-response.
   05 response-code           binary-long.
      *> 0=new posting, 2=exact retry, 4=rejection, 8=technical error
   05 response-reason         pic x(40).
