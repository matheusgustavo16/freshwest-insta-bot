// api instagram
const Insta = require('node-insta-web-api')
const InstaClient = new Insta();
// ferramentas gerais
const fetch = require('node-fetch');
const fs = require('fs')
const request = require('request')
const decode = require('html-entities');
var stringSimilarity = require("string-similarity");
// server / cron job
const express = require('express');
const cron = require('node-cron');
const app = express();
// definições de variaveis gerais
const USER = 'rapboard_br';
const PASS = 'siwcuii8';
const TAGS_BLOCKED_WORDS = ['para', 'mais', 'agora', 'aposentar', 'disse', 'como', 'será', 'todos', 'você', 'voce'];

// FUNÇÕES

const download = (url, path, callback) => {
    request.head(url, (err, res, body) => {
        request(url)
        .pipe(fs.createWriteStream(path))
        .on('close', callback)
    })
} 

const countOccurr = (arr,val) => {
    return arr.reduce((acc,elem)=>{
        return (val === elem ? acc+1 : acc)
    }, 0);
}

const selectBestTags = (tags_bruta) => {
    var selectedBest = [];
    for(var i=0; i < tags_bruta.length; i++){
        //return false;
        if(tags_bruta[i].word && !selectedBest.includes(`#${tags_bruta[i].word}`) && !TAGS_BLOCKED_WORDS.includes(`${tags_bruta[i].word}`) && tags_bruta[i].word.length >= 4){
            if(selectedBest.length < 8){
                selectedBest.push(`#${tags_bruta[i].word}`);
            }
        }
    }
    return selectedBest;
}

const convertToTags = (texto_full) => {
    var texto = texto_full.toLowerCase().split(' ');
    var words_occurrency = [];

    for(var i=0; i < texto.length; i++){
        texto[i] = texto[i].replace('.', '').replace(',', '').replace(':', '').replace("”", '').replace("“", '');
        // retira palavras menores de 3 caracteres
        if(texto[i].trim().length <= 3){
            //console.log('palavrascurta:', i, texto[i]);
            const remove = texto.splice(i,1);
        }else 
        // retira tags com numeros
        if(
            texto[i].includes('1') ||
            texto[i].includes('2') ||
            texto[i].includes('3') ||
            texto[i].includes('4') ||
            texto[i].includes('5') ||
            texto[i].includes('6') ||
            texto[i].includes('7') ||
            texto[i].includes('8') ||
            texto[i].includes('9') ||
            texto[i].includes('0')
        ){
            if(texto[i] !== 'l7nnon'){
                //console.log('numeros:', i, texto[i]);
                const remove = texto.splice(i,1);
            }
        }
        words_occurrency.push({
            'word': texto[i],
            'qtd': countOccurr(texto,texto[i])
        });
    }
    words_occurrency.sort((a,b)=>{
        if (a.qtd < b.qtd) {
            return 1;
        }
        if (a.qtd > b.qtd) {
            return -1;
        }
        // a must be equal to b
        return 0;
    })
    //console.log('words_occurrency', words_occurrency);
    //console.log('selectBestTags', selectBestTags(words_occurrency).join(' '));
    //console.log('newlist', texto);
    //console.log('qtd_palavras:', texto.length);
    return selectBestTags(words_occurrency).join(' ');
}

const savePostInstaDB = async(id_post, tags) => {
    let data_noticia;
    await fetch('https://radiofreshwest.com.br/westsideco.com.br/rapboard/get.php?req=post_bot_instagram', {
        method: 'post',
        body:    JSON.stringify({ id_post: id_post, tags: tags }),
        headers: { 'Content-Type': 'application/json' },
    })
    .then(res => res.text())
    .then(body => data_noticia = JSON.parse(body))
    .catch((err)=>{
        console.log(err)
    });
    // se tiver sucesso na busca pelo id
    if(data_noticia){
        console.log('salvo com sucesso', data_noticia)
    }
}

const postNoticia = async(ID_NEWS) => {
    let data_noticia;
    await fetch('https://radiofreshwest.com.br/westsideco.com.br/rapboard/get.php?req=get_noticia_data', {
        method: 'post',
        body:    JSON.stringify({ id: ID_NEWS }),
        headers: { 'Content-Type': 'application/json' },
    })
    .then(res => res.text())
    .then(body => data_noticia = JSON.parse(body))
    .catch((err)=>{
        console.log(err)
    });
    // se tiver sucesso na busca pelo id
    if(data_noticia){
        data_noticia['dados_noticia']['tags'] = convertToTags((data_noticia.dados_noticia.content !== '') ? data_noticia.dados_noticia.content : data_noticia.dados_noticia.resumo);
        //console.log(data_noticia);
        //return false;
        download(`https://radiofreshwest.com.br/westsideco.com.br/rapboard/thumb.php?id_post=${ID_NEWS}&w=1000&h=1000`, './fotodopost.jpg', async() => {
            console.log('✅ Foto salva com sucesso, postando no Instagram!')
            await InstaClient.login({USER,PASS}, { language: 'pt-BR', proxy: undefined });
            const photo = './fotodopost.jpg';
            const resultAddPost = await InstaClient.addPost(photo, `${data_noticia.dados_noticia.resumo}\nSaiba mais em rapboard.radiofreshwest.com.br\n\n${data_noticia['dados_noticia']['tags']}`);
            //console.log(resultAddPost)
            fs.unlinkSync('./fotodopost.jpg');
            // save to db log
            if(resultAddPost['status'] == 'ok'){
                console.log('✅ Foto postada no Instagram, salvando log no bd...')
            }
            savePostInstaDB(data_noticia['dados_noticia']['id'], data_noticia['dados_noticia']['tags']);
        })
    }else{
        console.log('erro no data_noticia')
    }
}

const countNewsSimilar = (array, title) => {
    var count_return = 0;
    if(array && array.length >= 1){
        for(var i=0; i < array.length; i++){
            count_return += stringSimilarity.compareTwoStrings(title, array[i].titulo);
        }
    }else{
        return null;
    }
    return count_return;
}

const getLastNews = async() => {
    let data_noticia;
    await fetch('https://radiofreshwest.com.br/westsideco.com.br/rapboard/get.php?req=feed_bot_instagram&page=1&limit=500&date_limit=today', {
        method: 'get',
        headers: { 'Content-Type': 'application/json' },
    })
    .then(res => res.text())
    .then(body => data_noticia = JSON.parse(body))
    .catch((err)=>{
        console.log(err)
    });
    //console.log(data_noticia)
    // retorna as noticias
    if(data_noticia.feed){
        for(var n=0; n < data_noticia.feed.length; n++){
            data_noticia.feed[n]['count_news_similar'] = countNewsSimilar(data_noticia.feed, decode.decode(data_noticia.feed[n].titulo));
        }
        data_noticia.feed.sort((a,b)=>{
            if (a.count_news_similar < b.count_news_similar) {
                return 1;
            }
            if (a.count_news_similar > b.count_news_similar) {
                return -1;
            }
            // a must be equal to b
            return 0;
        });
        //console.log('usort news', data_noticia);
        // PEGA A NOTÍCIA MAIS POPULAR E TENTA POSTAR NO INSTA
        console.log('noticia mais popular de hoje:', data_noticia.feed[0]['titulo']);
        postNoticia(data_noticia.feed[0]['id'])
    }else{
        console.log('❌ Zero notícias postadas hoje até o momento.')
    }
}

// START SERVER / CRON JOB

app.listen(3333, () => {
    console.log('running on port 3333');
    // cron format - todo dia 4/4 horas | 0 0 0/4 1/1 * ? *
    cron.schedule('0 0 0/4 1/1 * * *', () => {
        var d = new Date();
        var hour = d.getHours();
        if(
            hour !== 21 &&
            hour !== 22 &&
            hour !== 23 &&
            hour !== 0 &&
            hour !== 1 &&
            hour !== 2 &&
            hour !== 3 &&
            hour !== 4 &&
            hour !== 5 &&
            hour !== 6 &&
            hour !== 7 &&
            hour !== 8 &&
            hour !== 9 &&
            hour !== 10
        ){
            console.log('📸 Hora de postar no Instagram!')
            getLastNews()
            return false;
        }
    });
})