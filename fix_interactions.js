const mongoose = require('mongoose');
mongoose.connect('mongodb://mongodb:27017/crm').then(async () => {
    const Customer = require('./backend/models/Customer');
    const User = require('./backend/models/User');

    const customers = await Customer.find({'interactions.createdBy': {$exists: false}});
    let fixedCount = 0;

    for (let customer of customers) {
        let modified = false;
        for (let interaction of customer.interactions) {
            if (!interaction.createdBy && interaction.author) {
                const user = await User.findOne({fullName: interaction.author});
                if (user) {
                    interaction.createdBy = user._id;
                    modified = true;
                }
            }
        }
        if (modified) {
            await customer.save();
            fixedCount++;
        }
    }

    console.log(`Fixed missing createdBy for ${fixedCount} customers.`);
    process.exit(0);
});
