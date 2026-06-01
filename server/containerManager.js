import Docker from 'dockerode';
import { exec } from 'child_process';
import path from 'path';

const docker = new Docker();

export async function ensureContainer(userId) {
    const containerName = `ide_user_${userId}`;
    const volumeName = `ide_vol_${userId}`;

    // 1. Ensure Volume exists
    try {
        await docker.getVolume(volumeName).inspect();
    } catch (e) {
        if (e.statusCode === 404) {
            console.log(`Creating volume ${volumeName}`);
            await docker.createVolume({ Name: volumeName });
        } else {
            throw e;
        }
    }

    // 2. Ensure Container exists and is running
    let container;
    let newlyCreated = false;
    try {
        container = docker.getContainer(containerName);
        const info = await container.inspect();
        if (!info.State.Running) {
            console.log(`Starting stopped container ${containerName}`);
            await container.start();
        }
    } catch (e) {
        if (e.statusCode === 404) {
             console.log(`Creating container ${containerName}`);
             container = await docker.createContainer({
                 Image: 'webcloud-ide-base',
                 name: containerName,
                 Tty: true, // Needed so docker exec can use bash properly
                 Cmd: ['tail', '-f', '/dev/null'],
                 HostConfig: {
                     Binds: [`${volumeName}:/home/user/workspace`]
                 }
             });
             await container.start();
             newlyCreated = true;
        } else {
            throw e;
        }
    }

    // 3. Seed initial files if newly created
    if (newlyCreated) {
        const srcPath = path.resolve('./__user');
        console.log(`Seeding files from ${srcPath} to ${containerName}...`);
        await new Promise((resolve, reject) => {
            // macOS/Linux: docker cp src/. dest/
            // Windows: docker cp src\. dest/ -> so we use regex replacement just in case
            exec(`docker cp "${srcPath}/." ${containerName}:/home/user/workspace/`, (err, stdout, stderr) => {
                if (err) {
                    console.error("Seed error", stderr);
                    // allow it to fail silently so container still starts
                    resolve(); 
                } else {
                    resolve();
                }
            });
        });
        
        // Ensure perm issues don't happen inside
        await containerExec(userId, ['chmod', '-R', '777', '/home/user/workspace']);
    }

    return container.id;
}

export async function stopContainer(userId) {
    const containerName = `ide_user_${userId}`;
    const container = docker.getContainer(containerName);
    try {
        const info = await container.inspect();
        if (info.State.Running) {
            await container.stop();
            console.log(`Stopped container ${containerName}`);
        }
    } catch (e) {
        if (e.statusCode !== 404) throw e;
    }
}

export async function destroyContainer(userId) {
    const containerName = `ide_user_${userId}`;
    const container = docker.getContainer(containerName);
    try {
        await container.remove({ force: true });
        console.log(`Removed container ${containerName}`);
    } catch (e) {
        if (e.statusCode !== 404) throw e;
    }

    const volumeName = `ide_vol_${userId}`;
    try {
        const volume = docker.getVolume(volumeName);
        await volume.remove();
        console.log(`Removed volume ${volumeName}`);
    } catch (e) {
        if (e.statusCode !== 404) throw e;
    }
}

export async function getContainerInfo(userId) {
    const containerName = `ide_user_${userId}`;
    const container = docker.getContainer(containerName);
    try {
        const info = await container.inspect();
        return {
            containerId: info.Id,
            status: info.State.Status,
            volumeName: `ide_vol_${userId}`
        };
    } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
    }
}

export async function containerExec(userId, cmdArray, inputStr = null) {
    const containerName = `ide_user_${userId}`;
    const container = docker.getContainer(containerName);
    
    // Check if running
    try {
        const info = await container.inspect();
        if(!info.State.Running) return null;
    } catch(e) { return null; }

    const execOpts = {
        AttachStdout: true,
        AttachStderr: true,
        Cmd: cmdArray
    };
    
    if (inputStr !== null) {
        execOpts.AttachStdin = true;
    }

    const execInstance = await container.exec(execOpts);
    const stream = await execInstance.start({ hijack: true, stdin: inputStr !== null });

    return new Promise((resolve, reject) => {
        let stdoutData = [];

        if (inputStr !== null) {
            stream.write(inputStr);
            stream.end();
        }

        // Tty uses raw stream, but since we didn't specify Tty: true in execOpts, we must demux
        docker.modem.demuxStream(stream, {
            write: (chunk) => { stdoutData.push(chunk); }
        }, {
            write: (chunk) => { stdoutData.push(chunk); } // ignoring stderr as standard output for simplicity
        });

        stream.on('end', () => {
            resolve(Buffer.concat(stdoutData).toString('utf-8'));
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}
