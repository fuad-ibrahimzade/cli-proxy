create nodejs cli proxy tool project 
1) that will have --proxies-file option containing file where used proxies will be saved and at each run checked if not using same proxy. 
2) will fetch always updodate free proxies and select one not reused working one and save it --proxies-file. 
3) it will allow passig any command/app with its arguments to it and it will run network of this command/app/cli tool through this proxy to bypass network resstrictions.
4) it will use sing-box proxy tool on linux, androdi-termux, windows platforms
5) it will have --countries "usa, tur" like option to search proxies form those countries only
