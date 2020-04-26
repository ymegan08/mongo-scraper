var express = require("express");
var logger = require("morgan");
var mongoose = require("mongoose");
var exphbs = require("express-handlebars");

// Our scraping tools
var axios = require("axios");
var cheerio = require("cheerio");

// Require all models
var db = require("./models");

var PORT = process.env.PORT || 3000;

// Initialize Express
var app = express();

// Use morgan logger for logging requests
app.use(logger("dev"));
// Parse request body as JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Make public a static folder
app.use(express.static("public"));
// Connect handlebars
app.engine("handlebars", exphbs({ defaultLayout: "main" }));
app.set("view engine", "handlebars");

// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/mongoHeadlines";
mongoose.connect(MONGODB_URI);

///////////////////////////////////////////////// ROUTES

// MAIN PAGE
app.get("/", function(req,res){
    db.Article.find({ "saved": false}, function(err, data){
        var viewObj = {
            article: data
        };
        console.log(viewObj);
        res.render("index", viewObj);
    });
});

app.get("/saved", function(req,res){
    db.Article.find({"saved": true}).populate("note").exec(function(err, data){
        var viewObj = {
            article: articles
        };
        console.log(viewObj);
        res.render("saved", viewObj);
    });
});

// SCRAPE
app.get("/scrape", function(req, res){
    // Grab body of html with axios
    axios.get("https://www.nytimes.com/section/nyregion").then(function(response){
        // Load into cheerio and save it to $ for shorthand selector
        var $ = cheerio.load(response.data);
        $("div.story-body").each(function(i, element){
            // Save an empty result object
            var result = {};
            // Add the text and href of every link and save them as properties of result object
            result.title = $(element).children("h2.headline").text();
            result.link = $(element).find("a").attr("href");
            result.summary = $(element).find("p.summary").text();

            // Create new Article using result object from scrabing
            db.Article.create(result).then(function(data){
                console.log(data);
            }).catch(function(error){
                return res.json(error);
            })
        });
        // Send message to client
        res.send("Scrape Complete");
    });
});

// CLEAR UNSAVED
app.get('/clear', function(req, res){
    db.Article.remove({"saved": false}, function(err, doc){
        if (err){
            console.log(err);
        }
        else {
            console.log("Removed unsaved articles");
        }
    });
    // Redirect to homepage
    res.redirect('/');
});

// GET ALL ARTICLES
app.get("/articles", function(req, res){
    db.Article.find({}).then(function(dbArticle){
        res.json(dbArticle);
    }).catch(function(error){
        res.json(error);
    });
});

// GET ARTICLE BY ID
app.get("/articles/:id", function(req, res){
    db.Article.find(
        {
            _id: req.params.id
        }
    ).populate("note")
    .then(function(dbArticle){
        res.send(dbArticle);
    }).catch(function(error){
        res.json(error);
    });
});

// SAVE ARTICLE
app.post("/articles/save/:id", function(req, res){
    db.Article.findOneAndUpdate(
        {
            "_id": req.params.id
        },
        {
            "saved": true   // Update saved to true
        }
    ).then(function(dbArticle){
        res.send(dbArticle);
    }).catch(function(error){
        res.json(error)
    })
});

// DELETE ARTICLE
app.post("/articles/delete/:id", function(req, res){
    db.Article.findOneAndUpdate(
        {
            "_id": req.params.id
        },
        {
            "saved": false,
            "note": []
        }
    ).then(function(dbArticle){
        res.send(dbArticle);
    }).catch(function(error){
        res.json(error);
    })
});

// ADD COMMENT
app.post("/notes/save/:id", function(req, res){
    // Create new note
    var newNote = new Note({
        body: req.body.text,
        article: req.params.id
    });
    // Save new note to the database
    newNote.save(function(error, note){
        if (error){
            console.log(error);
        }
        else{
            db.Article.findOneAndUpdate(
                {
                    "_id": req.params.id
                },
                {$push: {"note": note}}
            ).exec(function(error){
                if (error){
                    res.send(error);
                }
                else{
                    res.send(note);
                }
            });
        }
    });
});

// DELETE COMMENT
app.delete("/notes/delete/:note_id/:article_id", function (req, res){
    // Get note by id
    db.Note.findOneAndRemove({"_id": req.params.note_id}, function(err){
        if (err){
            res.send(err);
        }
        else{
            db.Article.findOneAndUpdate(
                {
                    "_id": req.params.article_id
                },
                {$pull: {"note": req.params.note_id}}
            ).exec(function (error){
                if (error){
                    res.send(error);
                }
                else{
                    res.send("Comment deleted");
                }
            })
        }
    });
});

/////////////////////////////////////////////////

// Listen on the port
app.listen(PORT, function() {
    console.log("Listening on port: " + PORT);
  });