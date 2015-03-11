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

console.log("rs-friendly");
console.log("---------");
if (!env.RSF_U || !env.RSF_P){
    console.log("no credentials found, quitting");
    quit();
}
console.log("");

var u = env.RSF_U;
var p = env.RSF_P;
console.log("will log in as "+u);

var to_inject;

var page = require('webpage').create();

page.onResourceError = function(resourceError) {
    page.reason = resourceError.errorString;
    page.reason_url = resourceError.url;
};


console.log("navigating to sign in");
page.open('https://retrospring.net/sign_in', function(status) {
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
    if (msg.indexOf("RSF") != 0) return;
    msg = msg.replace("RSF", "");
    if (msg == "::Q"){
        console.log("[console] requested process exit, quitting");
        quit();
    }
    if (msg.indexOf("::DONE") == 0){
        msg = msg.replace("::DONE", "");
        console.log("[rsf] adding "+msg+" to added list");
        addedUsers.push(msg);
        return;
    }
    console.log('[console] ' + msg);
};

function handle_error(msg, trace){
    console.log("[rsf] got error");
    console.log(msg);
    console.log(trace);
}

function handle_url_change(url){
    console.log("[rsf] url changed: "+url);

    var injectors = {
        "https://retrospring.net/": login_success,
        "https://retrospring.net/sign_in": get_error,
        "https://retrospring.net/public": scrape
    };

    if (!injectors[url]){
        console.log("[rsf] no viable injector found for that url, quitting");
        return quit();
    }
    to_inject = injectors[url];
    page.onLoadFinished = reinject_script;
}

function reinject_script(){
    console.log("[rsf] reinjecting script");
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
    console.log("RSF"+"got alert, can't continue");
    var elem = $(".alert.alert-danger.alert-dismissible");
    var err = elem.contents().filter(function(){
        return this.nodeType == 3;
    })[1];
    console.log("RSF"+err.data.trim());
    console.log("RSF::Q");
}

function login_success(){
    console.log("RSF"+"login successful, beginning scrape");
    window.location.href = "https://retrospring.net/public";
}

function scrape(addedUsers){
    console.log("RSF"+"scraping from public question timeline");
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

    console.log("RSF"+"found "+users.length+" people");

    function add_user(name){
        addedUsers.push(name);
        console.log("RSF::DONE"+name);
    }

    var ADDED = 0;
    var NEWADD = 0;
    var SKIPPED = 0;
    function next_user(){
        if (!users.length){
            console.log(
                "RSF"+"added: "+ADDED+" ("+NEWADD+") | skipped: "+SKIPPED
            );
            console.log("RSF"+"done, reloading page in 30 seconds");
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
            "https://retrospring.net/ajax/create_friend",
            "screen_name="+user,
            function(data, textStatus){
                var messages = [
                    "Successfully followed user.",
                    "You are already following that user."
                ];
                if (messages.indexOf(data.message) == -1){
                    console.log("RSF"+"got an unknown status");
                    console.log("RSF"+JSON.stringify(data));
                    console.log("RSF::Q");
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
            console.log("RSF"+"failed");
        })

    }

    next_user();
}