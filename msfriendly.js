var system = require("system");
var env = system.env;

function quit(code){
    console.log("=========================================");
    console.log("quitting, ignore the below errors, if any");
    console.log("=========================================");
    code = code || 0;
    setTimeout(function(){phantom.exit(code);}, 0);
    phantom.onError = function(){};
    page.onError = function(){};
    throw "";
}

console.log("ms-friendly");
console.log("---------");
if (!env.MSF_U || !env.MSF_P){
    console.log("no credentials found, quitting");
    quit();
}
console.log("");

var u = env.MSF_U;
var p = env.MSF_P;
console.log("will log in as "+u);

var to_inject;

var page = require('webpage').create();

page.onResourceError = function(resourceError) {
    page.reason = resourceError.errorString;
    page.reason_url = resourceError.url;
};


console.log("navigating to sign in");
page.open('https://modernspring.sq10.net/sign_in', function(status) {
    if (status === "success"){
        console.log("signing in...");
        page.onConsoleMessage = handle_console;
        page.onError = handle_error;
        page.onUrlChanged = handle_url_change;
        page.evaluate(login_user, u, p);
    }
    else{
        console.log("sign in page failed");
        console.log("status: " + status);
        console.log("reason: " + page.reason);
        console.log("reason url: "+page.reason_url);
        phantom.exit();
    }
});

var addedUsers = [];

function handle_console(msg){
    if (msg.indexOf("MSF") != 0) return;
    msg = msg.replace("MSF", "");
    if (msg == "::Q"){
        console.log("[console] requested process exit, quitting");
        quit();
    }
    if (msg.indexOf("::DONE") == 0){
        msg = msg.replace("::DONE", "");
        console.log("[msf] adding "+msg+" to added list");
        addedUsers.push(msg);
        return;
    }
    console.log('[console] ' + msg);
};

function handle_error(msg, trace){
    console.log("[msf] got error");
    console.log(msg);
    console.log(trace);
}

function handle_url_change(url){
    console.log("[msf] url changed: "+url);

    var injectors = {
        "https://modernspring.sq10.net/": login_success,
        "https://modernspring.sq10.net/sign_in": get_error,
        "https://modernspring.sq10.net/public": scrape
    };

    if (!injectors[url]){
        console.log("[msf] no viable injector found for that url, quitting");
        return quit();
    }
    to_inject = injectors[url];
    page.onLoadFinished = reinject_script;
}

function reinject_script(){
    console.log("[msf] reinjecting script");
    page.evaluate(to_inject, addedUsers);
}

function login_user(u, p){
    $("#user_login").val(u);
    $("#user_password").val(p);
    $("#user_remember_me").prop("checked", true);
    $("input[name='commit']").click();
}

function get_error(){
    //sign in error, can't continue
    console.log("MSF"+"got alert, can't continue");
    var elem = $(".alert.alert-danger.alert-dismissible");
    var err = elem.contents().filter(function(){
        return this.nodeType == 3;
    })[1];
    console.log("MSF"+err.data.trim());
    console.log("MSF::Q");
}

function login_success(){
    console.log("MSF"+"login successful, beginning scrape");
    window.location.href = "https://modernspring.sq10.net/public";
}

function scrape(addedUsers){
    console.log("MSF"+"scraping from public question timeline");
    var users = [];

    var askers = $(
        "#timeline > .answerbox .panel-heading "+
        ".answerbox--question-user a:first-of-type"
    ).get();

    var answerers = $(
        "#timeline > .answerbox .row "+
        ".answerbox--answer-user a"
    ).get();

    var people = askers.concat(answerers);

    people.forEach(function(i){
        var user = $(i).attr("href").replace("/", "");
        if (users.indexOf(user) > -1) return;
        users.push(user);
    });

    console.log("MSF"+"found "+users.length+" people");

    function add_user(name){
        addedUsers.push(name);
        console.log("MSF::DONE"+name);
    }

    var ADDED = 0;
    var NEWADD = 0;
    var SKIPPED = 0;
    function next_user(){
        if (!users.length){
            console.log(
                "MSF"+"added: "+ADDED+" ("+NEWADD+") | skipped: "+SKIPPED
            );
            console.log("MSF"+"done, reloading page in 30 seconds");
            setTimeout(function(){window.location.reload();}, 30000);
            return;
        }
        var user = users.shift();
        if (addedUsers.indexOf(user) > -1){
            SKIPPED++;
            setTimeout(next_user);
            return;
        }

        $.post(
            "https://modernspring.sq10.net/ajax/create_friend",
            "screen_name="+user,
            function(data, textStatus){
                var messages = [
                    "Successfully followed user.",
                    "You are already following that user."
                ];
                if (messages.indexOf(data.message) == -1){
                    console.log("MSF"+"got an unknown status");
                    console.log("MSF"+JSON.stringify(data));
                    console.log("MSF::Q");
                    return;
                }
                add_user(user);
                ADDED++;
                if (data.message == messages[0]){
                    //this means that they are a new friend
                    NEWADD++;
                }
                setTimeout(next_user);
            }
        ).fail(function(){
            console.log("MSF"+"failed");
        })

    }

    next_user();
}
