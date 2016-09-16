package com.oz10.stropping;

import android.content.Intent;
import android.os.Bundle;
import android.support.design.widget.FloatingActionButton;
import android.support.design.widget.Snackbar;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;

import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;

import java.util.ArrayList;
import java.util.List;

public class IngredientEditActivity extends AppCompatActivity {

    Spinner _uomSpinner;
    Ingredient _ingredient;
    EditText _ingredientName;
    EditText _quantity;
    Switch _favourite;
    Switch _essential;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ingredient_edit);

        SetupActionbar();

        _ingredientName = (EditText) findViewById(R.id.ingredient_edit_name);
        _quantity = (EditText) findViewById(R.id.ingredient_edit_quantity_value);
        SetupUOMSpinner();
        _favourite = (Switch) findViewById(R.id.ingredient_edit_favourite_value);
        _essential = (Switch) findViewById(R.id.ingredient_edit_essential_value);

        Intent intent = getIntent();
        if (intent != null){
            Long ingredientId = intent.getLongExtra("IngredientId", 0);

            if (ingredientId != 0){
                StroppingDatabase db = new StroppingDatabase(this);
                db.open();

                _ingredient = db.getIngredientFromId(ingredientId);
                
                _ingredientName.setText(_ingredient.getName());
                _quantity.setText(String.valueOf(_ingredient.getQuantity()));
                
                _uomSpinner.setSelection(((ArrayAdapter)_uomSpinner.getAdapter()).getPosition(_ingredient.getUOM()));

                _favourite.setChecked(_ingredient.getFavourite());
                _essential.setChecked(_ingredient.getEssential());

                db.close();
            } else {
                _ingredient = new Ingredient();
            }

        }
    }
    
    private void SetupUOMSpinner()
    {
        //TODO Load these values from db
        List<String> uomList = new ArrayList<String>();
        uomList.add("number of");
        uomList.add("grams");
        uomList.add("kilograms");
        uomList.add("liters");
        uomList.add("milliliters");
        uomList.add("pints");
        
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, uomList);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        
        _uomSpinner = (Spinner) findViewById(R.id.ingredient_edit_uom_value);
        _uomSpinner.setAdapter(adapter);
        
    }

    private void SetupActionbar()
    {
        ActionBar actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        MenuInflater inflater = getMenuInflater();
        inflater.inflate(R.menu.menu_ok_delete, menu);
        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item){
        switch (item.getItemId())
        {
            case android.R.id.home:
                finish();
                break;

            case R.id.action_menu_delete:
                StroppingDatabase db = new StroppingDatabase(this);
                db.open();

                if (_ingredient.getId() != 0){
                    db.deleteIngredient(_ingredient);
                }

                finish();

                db.close();
                break;

            case R.id.action_menu_ok:
                String name = _ingredientName.getText().toString();
                String uom = String.valueOf(_uomSpinner.getSelectedItem());
                int quantity = Integer.valueOf(_quantity.getText().toString());

                int isFavourite = 0; //(_favourite.getChecked()) ? 1 : 0;
                int isEssential = 0; //(_essential.getChecked()) ? 1 : 0;

                db = new StroppingDatabase(this);
                db.open();

                if (_ingredient.getId() == 0){
                    // new ingredient
                    _ingredient = db.createIngredient(name, uom, quantity, quantity, isFavourite, isEssential,0, 0);
                }else{
                    db.updateIngredient(_ingredient.getId(), name, uom, quantity, quantity, isFavourite, isEssential,0, 0);
                }

                finish();

                db.close();
                break;
        }

        return true;
    }

}
