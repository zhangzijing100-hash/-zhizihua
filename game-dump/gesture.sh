#!/system/bin/sh
D=/dev/input/event4
SE() { sendevent $D 3 53 $1; sendevent $D 3 54 $2; sendevent $D 0 0 0; }
# ---- TOUCH DOWN ----
sendevent $D 3 47 0
sendevent $D 3 57 777
SE 788 969
sleep 0.15
SE 732 1026   # seg 1
sleep 0.045
SE 689 1068   # seg 1
sleep 0.045
SE 859 898   # seg 1
sleep 0.045
SE 916 842   # seg 2
sleep 0.045
SE 958 800   # seg 2
sleep 0.045
SE 759 907   # seg 2
sleep 0.045
SE 680 914   # seg 3
sleep 0.045
SE 620 919   # seg 3
sleep 0.045
SE 830 978   # seg 3
sleep 0.045
SE 887 1034   # seg 4
sleep 0.045
SE 929 1077   # seg 4
sleep 0.045
SE 759 907   # seg 4
sleep 0.045
SE 703 851   # seg 5
sleep 0.045
SE 660 808   # seg 5
sleep 0.045
SE 689 978   # seg 5
sleep 0.045
SE 632 1034   # seg 6
sleep 0.045
SE 590 1077   # seg 6
sleep 0.045
SE 759 907   # seg 6
sleep 0.045
SE 816 851   # seg 7
sleep 0.045
SE 858 808   # seg 7
sleep 0.045
SE 660 916   # seg 7
sleep 0.045
SE 580 923   # seg 8
sleep 0.045
SE 520 928   # seg 8
sleep 0.045
SE 731 987   # seg 8
sleep 0.045
SE 787 1043   # seg 9
sleep 0.045
SE 830 1086   # seg 9
sleep 0.045
SE 660 916   # seg 9
sleep 0.045
SE 603 859   # seg 10
sleep 0.045
SE 561 817   # seg 10
sleep 0.045
SE 589 987   # seg 10
sleep 0.045
SE 533 1043   # seg 11
sleep 0.045
SE 490 1086   # seg 11
sleep 0.045
SE 660 916   # seg 11
sleep 0.045
SE 716 859   # seg 12
sleep 0.045
SE 759 817   # seg 12
sleep 0.045
SE 560 925   # seg 12
sleep 0.045
SE 481 932   # seg 13
sleep 0.045
SE 421 937   # seg 13
sleep 0.045
SE 631 995   # seg 13
sleep 0.045
SE 688 1052   # seg 14
sleep 0.045
SE 730 1094   # seg 14
sleep 0.045
SE 560 925   # seg 14
sleep 0.045
SE 504 868   # seg 15
sleep 0.045
SE 461 826   # seg 15
sleep 0.045
SE 490 995   # seg 15
sleep 0.045
SE 433 1052   # seg 16
sleep 0.045
SE 391 1094   # seg 16
sleep 0.045
SE 560 925   # seg 16
sleep 0.045
SE 617 868   # seg 17
sleep 0.045
SE 659 826   # seg 17
sleep 0.045
SE 461 933   # seg 17
sleep 0.045
SE 381 940   # seg 18
sleep 0.045
SE 321 946   # seg 18
sleep 0.045
SE 531 1004   # seg 18
sleep 0.045
SE 588 1061   # seg 19
sleep 0.045
SE 630 1103   # seg 19
sleep 0.045
SE 461 933   # seg 19
sleep 0.045
SE 404 877   # seg 20
sleep 0.045
SE 362 834   # seg 20
sleep 0.045
SE 390 1004   # seg 20
sleep 0.045
SE 333 1061   # seg 21
sleep 0.045
SE 291 1103   # seg 21
sleep 0.045
SE 461 933   # seg 21
sleep 0.045
SE 517 877   # seg 22
sleep 0.045
SE 560 834   # seg 22
sleep 0.045
SE 361 942   # seg 22
sleep 0.045
SE 281 949   # seg 23
sleep 0.045
SE 222 954   # seg 23
sleep 0.045
SE 432 1013   # seg 23
sleep 0.045
SE 488 1069   # seg 24
sleep 0.045
SE 531 1112   # seg 24
sleep 0.045
SE 361 942   # seg 24
sleep 0.045
SE 304 886   # seg 25
sleep 0.045
SE 262 843   # seg 25
sleep 0.045
SE 290 1013   # seg 25
sleep 0.045
SE 234 1069   # seg 26
sleep 0.045
SE 191 1112   # seg 26
sleep 0.045
SE 361 942   # seg 26
sleep 0.045
SE 418 886   # seg 27
sleep 0.045
SE 460 843   # seg 27
sleep 0.045
SE 261 951   # seg 27
sleep 0.045
SE 182 958   # seg 28
sleep 0.045
SE 122 963   # seg 28
sleep 0.045
SE 332 1022   # seg 28
sleep 0.045
SE 389 1078   # seg 29
sleep 0.045
SE 431 1120   # seg 29
sleep 0.045
SE 261 951   # seg 29
sleep 0.045
SE 205 894   # seg 30
sleep 0.045
SE 162 852   # seg 30
sleep 0.045
# ---- TOUCH UP ----
sendevent $D 3 57 -1
sendevent $D 0 0 0
