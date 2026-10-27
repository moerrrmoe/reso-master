import { createInterface } from "readline/promises";

const authenticateClient = async (client) => {
    const reader = createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    try {
        await client.start({
            phoneNumber: async () => await reader.question("Enter phone number: "),
            password: async () => await reader.question("Enter password: "),
            phoneCode: async () => await reader.question("Enter code: "),
        });
        console.log("Client authenticated");
    } catch (error) {
        console.log(error.message);
    } finally {
        reader.close();
    }

    const me = await client.getMe();
    console.log("logged in as:", me.firstName);
    return me;
}

export default authenticateClient;