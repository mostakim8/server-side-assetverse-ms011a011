const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors({
    origin: [
      'http://localhost:5173', 
      'http://localhost:5174',  
      'https://inspiring-medovik-fc9331.netlify.app'
    ],
    
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 200,
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@aimodelmanagerdb.du0jjco.mongodb.net/AssetVerseDB?retryWrites=true&w=majority&appName=AIModelManagerDB`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const db = client.db("AssetVerseDB");
        const usersCollection = db.collection("users");
        const assetsCollection = db.collection("assets");
        const requestsCollection = db.collection("requests");

        console.log("Connected to AssetVerseDB Successfully!");

       //JWT & Security Middlewares
        
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                next();
            });
        };

        const verifyHR = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email });
            if (user?.role !== 'hr') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        };

        //user and team management
        
        app.get('/users/role/:email', async (req, res) => {
            const user = await usersCollection.findOne({ email: req.params.email });
            res.send({ role: user?.role || null });
        });

        app.get('/users/:email', verifyToken, async (req, res) => {
            const result = await usersCollection.findOne({ email: req.params.email });
            res.send(result);
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) return res.send({ message: 'user exists', insertedId: null });
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/update/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const updatedData = req.body;
            const result = await usersCollection.updateOne(
                { email: email },
                { $set: { name: updatedData.name, photo: updatedData.image } }
            );
            res.send(result);
        });

        app.get('/unaffiliated-employees', verifyToken, verifyHR, async (req, res) => {
            const result = await usersCollection.find({ role: 'employee', hrEmail: { $exists: false } }).toArray();
            res.send(result);
        });

        app.get('/team-count/:email', verifyToken, verifyHR, async (req, res) => {
            const count = await usersCollection.countDocuments({ hrEmail: req.params.email });
            res.send({ count });
        });

        app.patch('/add-to-team', verifyToken, verifyHR, async (req, res) => {
            const { employeeIds, hrEmail, companyName, companyLogo } = req.body;
            const result = await usersCollection.updateMany(
                { _id: { $in: employeeIds.map(id => new ObjectId(id)) } },
                { $set: { hrEmail, companyName, companyLogo, joinedDate: new Date().toLocaleDateString() } }
            );
            res.send(result);
        });

//see own employees
        app.get('/my-employees/:email', verifyToken, verifyHR, async (req, res) => {
            const result = await usersCollection.find({ hrEmail: req.params.email }).toArray();
            res.send(result);
        });

        // remove employee from team
        app.patch('/employees/remove/:id', verifyToken, verifyHR, async (req, res) => {
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $unset: { hrEmail: "", companyName: "", companyLogo: "", joinedDate: "" } }
            );
            res.send(result);
        });

        // see own team (for employees)
        app.get('/my-team/:email', verifyToken, async (req, res) => {
            const user = await usersCollection.findOne({ email: req.params.email });
            if (!user || !user.hrEmail) return res.send([]);
            const team = await usersCollection.find({ hrEmail: user.hrEmail }).toArray();
            res.send(team);
        });

        // Asset Management APIs
        

        app.post('/assets', verifyToken, verifyHR, async (req, res) => {
            const assetData = req.body;
            const result = await assetsCollection.insertOne({
                ...assetData,
                productQuantity: parseInt(assetData.productQuantity),
                addedDate: new Date().toLocaleDateString()
            });
            res.send(result);
        });

        app.get('/assets/:email', verifyToken, verifyHR, async (req, res) => {
            const { search, filter, sort } = req.query;
            let query = { hrEmail: req.params.email };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (filter) query.productType = filter;
            let sortOption = {};
            if (sort === 'quantity') sortOption.productQuantity = -1;
            const result = await assetsCollection.find(query).sort(sortOption).toArray();
            res.send(result);
        });

        app.put('/assets/:id', verifyToken, verifyHR, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedAsset = req.body;
            const result = await assetsCollection.updateOne(filter, { $set: updatedAsset });
            res.send(result);
        });

        app.delete('/assets/:id', verifyToken, verifyHR, async (req, res) => {
            const result = await assetsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
            res.send(result);
        });
// available assets for employees to request
        app.get('/available-assets/:hrEmail', verifyToken, async (req, res) => {
            const { search, type } = req.query;
            let query = { hrEmail: req.params.hrEmail, productQuantity: { $gt: 0 } };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (type) query.productType = type;
            const result = await assetsCollection.find(query).toArray();
            res.send(result);
        });

       // request management APIs

        app.post('/requests', verifyToken, async (req, res) => {
            const request = req.body;
            const result = await requestsCollection.insertOne(request);
            res.send(result);
        });

        app.get('/all-requests/:email', verifyToken, verifyHR, async (req, res) => {
            const { search } = req.query;
            let query = { hrEmail: req.params.email };
            if (search) {
                query.$or = [
                    { userEmail: { $regex: search, $options: 'i' } },
                    { userName: { $regex: search, $options: 'i' } }
                ];
            }
            const result = await requestsCollection.find(query).toArray();
            res.send(result);
        });

        app.patch('/requests/:id', verifyToken, verifyHR, async (req, res) => {
            const { status, assetId } = req.body;
            const id = req.params.id;
            const result = await requestsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status, approvalDate: new Date().toLocaleDateString() } }
            );
            if (status === 'Approved') {
                await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: -1 } });
            }
            res.send(result);
        });

        app.get('/my-requests/:email', verifyToken, async (req, res) => {
            const { search, status, type } = req.query;
            let query = { userEmail: req.params.email };
            if (search) query.productName = { $regex: search, $options: 'i' };
            if (status) query.status = status;
            if (type) query.productType = type;
            const result = await requestsCollection.find(query).toArray();
            res.send(result);
        });

        app.delete('/requests/cancel/:id', verifyToken, async (req, res) => {
            const result = await requestsCollection.deleteOne({ _id: new ObjectId(req.params.id), status: 'Pending' });
            res.send(result);
        });

        app.patch('/requests/return/:id', verifyToken, async (req, res) => {
            const { assetId } = req.body;
            const updateRequest = await requestsCollection.updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status: 'Returned' } }
            );
            if (updateRequest.modifiedCount > 0) {
                await assetsCollection.updateOne({ _id: new ObjectId(assetId) }, { $inc: { productQuantity: 1 } });
            }
            res.send(updateRequest);
        });

        //dashboard stats APIs
        
        app.get('/hr-stats/:email', verifyToken, verifyHR, async (req, res) => {
            const email = req.params.email;
            const pendingRequests = await requestsCollection.find({ hrEmail: email, status: 'Pending' }).limit(5).toArray();
            const limitedStock = await assetsCollection.find({ hrEmail: email, productQuantity: { $lt: 10 } }).toArray();
            const returnableCount = await assetsCollection.countDocuments({ hrEmail: email, productType: 'Returnable' });
            const nonReturnableCount = await assetsCollection.countDocuments({ hrEmail: email, productType: 'Non-returnable' });
            res.send({ pendingRequests, limitedStock, chartData: [{ name: 'Returnable', value: returnableCount }, { name: 'Non-returnable', value: nonReturnableCount }] });
        });

        app.get('/employee-stats/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const pendingRequests = await requestsCollection.find({ userEmail: email, status: 'Pending' }).toArray();
            const allRequests = await requestsCollection.find({ userEmail: email }).toArray();
            const currentMonth = new Date().getMonth();
            const monthlyCount = allRequests.filter(r => new Date(r.requestDate).getMonth() === currentMonth).length;
            res.send({ pendingRequests, monthlyCount });
        });

    } finally { }
}
run().catch(console.dir);
app.get('/', (req, res) => res.send('AssetVerse Server is Secure and Running'));
app.listen(port, () => console.log(`Server on port ${port}`));