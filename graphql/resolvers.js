const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const Post = require('../models/post');
const { argsToArgsConfig } = require('graphql/type/definition');
const { clearImage } = require('../util/file');


module.exports = {
    createUser: async function ({ userInput }, req) {
        // const email = args.userInput.email;
        const errors =  [];
        if (!validator.isEmail(userInput.email)) {
            errors.push({message: 'Email is invalid.'});
        }
        if(validator.isEmpty(userInput.password) || (!validator.isLength(userInput.password, { min: 5 }))) {
            errors.push({ message: 'Password too short.' });
        }
        if (errors.length > 0) {
            const error = new Error('Invalid input!');
            error.data = errors;
            error.code = 422;
            throw error;
        }
        const existingUser = await User.findOne({ email: userInput.email });
        if (existingUser) {
            const error = new Error('User exist already!');
            throw error;
        }
        const hashedPw = await bcrypt.hash(userInput.password, 12)
        const user = new User({
            email: userInput.email,
            name: userInput.name,
            password: hashedPw,
        });
        const createdUser = await user.save();
        return { ...createdUser._doc, _id: createdUser._id.toString() }
    },
    //bitno je napisati zarez nakon svakog resolvera
    login: async function ({ email, password }) {
        const user = await User.findOne({ email: email });
        if (!user) {
            const error = new Error('User not found.');
            error.code = 401;
            throw error;
        }
        const isEqual = await bcrypt.compare(password, user.password);
        if (!isEqual) {
            const error = new Error('Password is incorrect.');
            error.code = 401;
            throw error;
        }
        const token = jwt.sign({
            userId: user._id.toString(),
            email: user.email
        },
            'somesupersecretsecret',
            { expiresIn: '1h' }
        )
        return { token: token, userId: user._id.toString() };
    },

    createPost: async function({ postInput }, req) {
        //create post in database, and return data to client

        //check for user authentication
        if (!req.isAuth) {
            const error = new Error('Not authenticated.');
            error.statusCode = 401;
            throw error;
        }
        //input validation
        const errors = [];
        if (validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, { min: 5 })) {
            errors.push({message: 'Title is invalid.'});
        }
        if (validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, { min: 5 })) {
            errors.push({message: 'Content is invalid.'});
        }
        if (errors.length > 0) {
            const error = new Error('Invalid input!');
            error.data = errors;
            error.code = 422;
            throw error;
        }
        //get user from db 
        const user = await User.findById(req.userId);
        if (!user) {
            const error = new Error('Invalid user.');
            error.statusCode = 401;
            throw 401;
        }
        //create post
        const post = new Post({
            title: postInput.title,
            content: postInput.content,
            imageUrl: postInput.imageUrl,
            creator: user
        });
        const createdPost = await post.save();
        //Add post to users posts ...
        user.posts.push(createdPost);
        await user.save();
        //response to client
        return {
            ...createdPost._doc,
            _id: createdPost._id.toString(),
            createdAt: createdPost.createdAt.toISOString(),
            updatedAt: createdPost.updatedAt.toISOString()
        }
    },

    posts: async function({page}, req) {
        //check for user authentication
        if (!req.isAuth) {
            const error = new Error('Not authenticated.');
            error.statusCode = 401;
            throw error;
        }
        //pagination
        if (!page) {
            page = 1;
        }
        const perPage = 2;

        //number of total posts
        const totalPosts = await Post.find().countDocuments();
        //fetch all posts
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage)
            .populate('creator');

        console.log(totalPosts);
        console.log(posts);
        return {
            posts: posts.map(p => {
                return {
                    ...p._doc,
                    _id: p._id.toString(),
                    createdAt: p.createdAt.toISOString(),
                    updatedAt: p.updatedAt.toISOString()
                }
            }),
            totalPosts: totalPosts
        }
    },

    post: async function({ id }, req) {
         //check for user authentication
         if (!req.isAuth) {
            const error = new Error('Not authenticated.');
            error.statusCode = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if (!post) {
            const error = new Error('No post found!');
            error.code = 404;
            throw error;
        }
        return {
            ...post._doc,
            _id: post._id.toString(),
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        };
    },

    updatePost: async function({ id, postInput }, req) {
         //check for user authentication
         if (!req.isAuth) {
            const error = new Error('Not authenticated.');
            error.statusCode = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if (!post) {
            const error = new Error('No post found!');
            error.code = 404;
            throw error;
        }
        if (post.creator._id.toString() !== req.userId.toString()) {
            const error = new Error('Not authorized');
            error.code = 403;
            throw error;
        }
        //input validation
        const errors = [];
        if (validator.isEmpty(postInput.title) || !validator.isLength(postInput.title, { min: 5 })) {
            errors.push({message: 'Title is invalid.'});
        }
        if (validator.isEmpty(postInput.content) || !validator.isLength(postInput.content, { min: 5 })) {
            errors.push({message: 'Content is invalid.'});
        }
        if (errors.length > 0) {
            const error = new Error('Invalid input!');
            error.data = errors;
            error.code = 422;
            throw error;
        }
        post.title = postInput.title;
        post.content = postInput.content;
        if (postInput.imageUrl !== 'undefined') {
            post.imageUrl = postInput.imageUrl;
        }
        const updatedPost = await post.save();
        return {
            ...updatedPost._doc,
            _id: updatedPost._id.toString(),
            createdAt: updatedPost.createdAt.toISOString(),
            updatedAt: updatedPost.updatedAt.toISOString()
        }
    },

    deletePost: async function({id}, req) {
        //check for user authentication
        if (!req.isAuth) {
            const error = new Error('Not authenticated.');
            error.statusCode = 401;
            throw error;
        }
        const post = await Post.findById(id);
        //post find check
        if (!post) {
            const error = new Error('No post found!');
            error.code = 404;
            throw error;
        }
        //authorization check
        if (post.creator._id.toString() !== req.userId.toString()) {
            const error = new Error('Not authorized');
            error.code = 403;
            throw error;
        }
        clearImage(post.imageUrl);
        await Post.findByIdAndRemove(id);
        const user = await User.findById(req.userId);
        user.posts.pull(id);
        await user.save();
        return true
    },
    user: async function(args, req) {
         //check for user authentication
         if (!req.isAuth) {
            const error = new Error('Not authenticated.');
            error.statusCode = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if (!user) {
            const error = new Error('No user found!');
            error.code = 404;
            throw error;
        }
        return { 
            ...user._doc,
            _id: user._id.toString()
        }
    },
    updateStatus: async function({status}, req) {
        //check for user authentication
        if (!req.isAuth) {
            const error = new Error('Not authenticated.');
            error.statusCode = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if (!user) {
            const error = new Error('No user found!');
            error.code = 404;
            throw error;
        }
        user.status = status;
        await user.save();
        return {
            ...user._doc,
            _id: user._id.toString()
        }
    }
};