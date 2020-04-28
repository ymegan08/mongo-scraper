var express = require("express");
var logger = require("morgan");
var mongoose = require("mongoose");
var Handlebars = require('handlebars');
var exphbs = require("express-handlebars");
const {allowInsecurePrototypeAccess} = require('@handlebars/allow-prototype-access');

// Require all models
var db = require("./models");

// Our scraping tools
var axios = require("axios");
var cheerio = require("cheerio");

var PORT = process.env.PORT || 3030;

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
app.engine("handlebars", exphbs({
    defaultLayout: "main",
    partialsDir: "./views/layouts/partials",
    handlebars: allowInsecurePrototypeAccess(Handlebars)
}));
app.set("view engine", "handlebars");

// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
var MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/mongoHeadlines";
mongoose.connect(MONGODB_URI, {useNewUrlParser: true, useUnifiedTopology: true});

///////////////////////////////////////////////// ROUTES

// MAIN PAGE
app.get("/", function(req,res){
    db.Article.find({"saved": false}, function(err, data){
        var hbsObj = {
            article: data
        };
        console.log(hbsObj);
        res.render("index", hbsObj);
    });
});

app.get("/saved", function(req,res){
    db.Article.find({"saved": true}).populate("note").exec(function(err, data){
        var hbsObj = {
            article: data
        };
        console.log(hbsObj);
        res.render("saved", hbsObj);
    });
});

// SCRAPE
app.get("/scrape", function(req, res){

    // Grab body of html with axios
    axios.get("https://www.nytimes.com/").then(function(response){
        // Load into cheerio and save it to $ for shorthand selector
        const $ = cheerio.load(response.data);
        $("article.css-8atqhb").each(function(i, element){
            // Save an empty result object
            var result = {}; 
            
            // Add the text and href of every link and save them as properties of result object
            result.title = $(element).find("h2").text();
            result.link = "https://www.nytimes.com" + $(element).find("a").attr("href");
            result.summary = $(element).find("p").text();

            // Create new Article using result object from scraping
            db.Article.create(result).then(function(data){
                console.log(data);
            }).catch(function(error){
                console.log(error);
            })
        });
        // Send message to client
        res.send("Scrape Complete");
    });
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
    db.Article.findOne(
        {
            "_id": req.params.id
        }
    ).populate("note")
    .then(function(dbArticle){
        res.send(dbArticle);
    }).catch(function(error){
        res.json(error);
    });
});

// DELETE UNSAVED ARTICLES
app.get("/clear", function(req, res){
    db.Article.remove({saved: false}, function(err, doc){
        if(err){
            console.log(err);
        }
        else{
            console.log("Deleted Unsaved Articles");
        }
    });
    res.redirect("/");
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
    var newNote = new db.Note({
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
                }, {$push: {"note": note}}
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
                }, {$pull: {"note": req.params.note_id}}
            ).exec(function(error){
                if (error){
                    res.send(error);
                }
                else{
                    res.send("Comment deleted");
                }
            });
        }
    });
});

/////////////////////////////////////////////////

// Listen on the port
app.listen(PORT, function() {
    console.log("Listening on port: " + PORT);
  });